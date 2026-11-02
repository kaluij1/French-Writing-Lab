"use client";

import { useState } from "react";
import type {
  ComplexityResult,
  GrammarResult,
  Lens,
  MixingResult,
  VocabularyItem,
  VocabularyResult,
} from "@/lib/analysis/schemas";
import { splitSentences } from "@/lib/text";

export type SaveVocabInput = {
  french: string;
  english: string;
  explanation: string;
  source_sentence: string;
  source_lens: Lens;
};

export type ItemProps = {
  activeIndex: number | null;
  setActive: (i: number | null) => void;
  /** false when the item's passage could not be matched in the text (so it has no highlight) */
  isLocated: (i: number) => boolean;
};

export type VocabProps = {
  isSaved: (french: string) => boolean;
  onSave: (item: SaveVocabInput) => Promise<void>;
};

// ---------- shared pieces ----------

function Card({
  index,
  activeIndex,
  setActive,
  isLocated,
  children,
}: ItemProps & { index: number; children: React.ReactNode }) {
  const active = activeIndex === index;
  return (
    <article
      id={`item-${index}`}
      onMouseEnter={() => setActive(index)}
      onFocus={() => setActive(index)}
      className={`scroll-mt-28 rounded-lg border bg-paper-raised px-5 py-5 transition-[border-color,box-shadow] duration-200 ${
        active ? "border-rule-strong shadow-soft" : "border-rule"
      }`}
    >
      {children}
      {!isLocated(index) && (
        <p className="mt-4 text-[11px] text-ink-faint">
          This passage couldn’t be matched exactly in your text, so it isn’t highlighted.
        </p>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

function FrenchExample({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-[1.05rem] italic leading-relaxed text-ink">{children}</p>;
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] tracking-wide ${
        tone === "accent" ? "bg-paper-sunk text-ink-soft" : "border border-rule text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return <p className="mb-8 font-serif text-lg leading-relaxed text-ink-soft">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule px-6 py-10 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

function SaveButton({ french, isSaved, onSave, payload }: VocabProps & { french: string; payload: SaveVocabInput }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const saved = isSaved(french);
  return (
    <button
      disabled={saved || state === "saving"}
      onClick={async () => {
        setState("saving");
        try {
          await onSave(payload);
          setState("idle");
        } catch {
          setState("error");
        }
      }}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
        saved
          ? "border-sage/40 bg-sage-wash text-sage"
          : "border-rule-strong text-ink-soft hover:border-ink-faint hover:text-ink"
      }`}
    >
      {saved ? "✓ In your vocabulary" : state === "saving" ? "Saving…" : state === "error" ? "Retry save" : "+ Save to vocabulary"}
    </button>
  );
}

const firstOption = (s: string) => s.split(/\s+\/\s+/)[0].trim();

// ---------- Grammar ----------

const CATEGORY_LABEL: Record<string, string> = {
  grammar: "Grammar",
  agreement: "Agreement",
  conjugation: "Conjugation",
  word_order: "Word order",
  article_preposition: "Article / preposition",
  spelling_accent: "Spelling / accent",
  punctuation: "Punctuation",
  style: "Style",
  // categories used by analyses saved before the current classification
  verb_conjugation: "Conjugation",
  tense: "Tense",
  article: "Article",
  preposition: "Preposition",
  pronoun_placement: "Pronoun placement",
  sentence_construction: "Sentence construction",
  elision: "Elision",
  other: "Other",
};

type GrammarKind = "error" | "ambiguous" | "style";

const GRAMMAR_SECTIONS: { kind: GrammarKind; heading: string; note?: string }[] = [
  { kind: "error", heading: "Errors" },
  { kind: "ambiguous", heading: "Unclear passages", note: "The intended meaning isn’t certain. Check which reading you meant." },
  { kind: "style", heading: "Optional style suggestions", note: "Your French is correct here; these are alternatives, not corrections." },
];

export function GrammarView({ result, ...p }: { result: GrammarResult } & ItemProps) {
  // Older stored analyses have no `kind`; they only ever contained errors.
  const kindOf = (k: string | undefined): GrammarKind => (k === "ambiguous" || k === "style" ? k : "error");
  const indexed = result.issues.map((it, i) => ({ it, i, kind: kindOf(it.kind) }));
  const errorCount = indexed.filter((x) => x.kind === "error").length;

  return (
    <div>
      <Summary>{result.summary}</Summary>
      {errorCount === 0 && <Empty>No grammatical errors found.</Empty>}
      {GRAMMAR_SECTIONS.map(({ kind, heading, note }) => {
        const entries = indexed.filter((x) => x.kind === kind);
        if (!entries.length) return null;
        return (
          <section key={kind} className="mb-10 mt-2">
            <h3 className="eyebrow mb-1">{heading}</h3>
            {note && <p className="mb-4 text-xs text-ink-muted">{note}</p>}
            <div className={`space-y-4 ${note ? "" : "mt-3"}`}>
              {entries.map(({ it, i }) => (
                <Card key={i} index={i} {...p}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Chip tone="accent">{CATEGORY_LABEL[it.category] ?? it.category}</Chip>
                    {it.confidence && (
                      <span
                        className="text-[11px] text-ink-faint"
                        title="The model’s own estimate of how sure it is. Not a measured probability."
                      >
                        {it.confidence} confidence
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-lg">
                    <span
                      className={
                        kind === "error"
                          ? "text-ink-muted line-through decoration-terracotta/70 decoration-1"
                          : "text-ink-muted"
                      }
                    >
                      {it.original}
                    </span>
                    <span className="text-ink-faint" aria-hidden>
                      →
                    </span>
                    <span className="text-ink">{it.corrected}</span>
                    {kind === "ambiguous" && <span className="font-sans text-xs text-ink-muted">(most likely)</span>}
                  </div>
                  {it.sentence && it.sentence.trim() !== it.original.trim() && (
                    <Field label="In your sentence">
                      <p className="font-serif text-base text-ink-muted">{it.sentence}</p>
                    </Field>
                  )}
                  {kind === "ambiguous" && it.interpretations && it.interpretations.length > 0 && (
                    <Field label="Possible meanings">
                      <ul className="list-disc space-y-1 pl-5 font-serif text-base text-ink">
                        {it.interpretations.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </Field>
                  )}
                  <Field label="Why">{it.explanation}</Field>
                  <Field label="Rule · example">
                    <span className="mr-2 text-ink-soft">{it.rule}.</span>
                    <FrenchExample>{it.example}</FrenchExample>
                  </Field>
                  {it.valid_alternatives && it.valid_alternatives.length > 0 && (
                    <Field label="Also correct">
                      <span className="font-serif text-base text-ink">{it.valid_alternatives.join(" · ")}</span>
                    </Field>
                  )}
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------- Vocabulary ----------

// `english_word` only appears in analyses saved before Language Mixing took over English words.
type VocabKind = VocabularyItem["kind"] | "english_word";

const KIND_HEADINGS: Record<VocabKind, { heading: string; note?: string }> = {
  incorrect_choice: { heading: "Words that don’t fit here" },
  more_precise: { heading: "More precise words" },
  repetition: { heading: "Repetition" },
  enrichment: { heading: "Ways to enrich", note: "Your word is correct; these are richer options to know." },
  english_word: { heading: "Words you wrote in English" },
};

export function VocabularyView({
  result,
  text,
  ...p
}: { result: VocabularyResult; text: string } & ItemProps & VocabProps) {
  if (result.items.length === 0)
    return (
      <div>
        <Summary>{result.summary}</Summary>
        <Empty>No vocabulary suggestions for this draft.</Empty>
      </div>
    );
  const order: VocabKind[] = ["incorrect_choice", "more_precise", "repetition", "enrichment", "english_word"];
  const sentences = splitSentences(text);
  return (
    <div>
      <Summary>{result.summary}</Summary>
      {order.map((kind) => {
        const entries = result.items.map((it, i) => ({ it, i })).filter((x) => (x.it.kind as VocabKind) === kind);
        if (!entries.length) return null;
        const { heading, note } = KIND_HEADINGS[kind];
        return (
          <section key={kind} className="mb-10">
            <h3 className={`eyebrow ${note ? "mb-1" : "mb-4"}`}>{heading}</h3>
            {note && <p className="mb-4 text-xs text-ink-muted">{note}</p>}
            <div className="space-y-4">
              {entries.map(({ it, i }) => {
                const sentence = it.sentence || (sentences.find((s) => s.includes(it.original)) ?? "");
                return (
                  <Card key={i} index={i} {...p}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-lg">
                        <span className="text-ink-muted">{it.original}</span>
                        <span className="text-ink-faint" aria-hidden>
                          →
                        </span>
                        <span className="text-ink">{it.suggestion}</span>
                      </div>
                      <SaveButton
                        french={firstOption(it.suggestion)}
                        isSaved={p.isSaved}
                        onSave={p.onSave}
                        payload={{
                          french: firstOption(it.suggestion),
                          english: it.english,
                          explanation: it.explanation,
                          source_sentence: sentence,
                          source_lens: "vocabulary",
                        }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>“{it.english}”</span>
                      <Chip>{it.translation_type === "direct" ? "Direct translation" : "Contextual expression"}</Chip>
                    </div>
                    <Field label="Why this fits">{it.explanation}</Field>
                    <Field label="Example">
                      <FrenchExample>{it.example}</FrenchExample>
                    </Field>
                    {it.alternatives.length > 0 && (
                      <Field label="Similar expressions">
                        <span className="font-serif text-base text-ink">{it.alternatives.join(" · ")}</span>
                      </Field>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------- Language mixing ----------

export function MixingView({ result, ...p }: { result: MixingResult } & ItemProps & VocabProps) {
  return (
    <div>
      <Summary>{result.summary}</Summary>
      {result.insertions.length === 0 ? (
        <Empty>No English words or phrases were found in this draft.</Empty>
      ) : (
        <div className="space-y-4">
          {result.insertions.map((it, i) => (
            <Card key={i} index={i} {...p}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-lg">
                  <span className="rounded-sm bg-slate-wash px-1 text-slate">{it.original}</span>
                  <span className="text-ink-faint" aria-hidden>
                    →
                  </span>
                  <span className="text-ink">{it.french}</span>
                </div>
                <SaveButton
                  french={firstOption(it.french)}
                  isSaved={p.isSaved}
                  onSave={p.onSave}
                  payload={{
                    french: firstOption(it.french),
                    english: it.original,
                    explanation: it.explanation,
                    source_sentence: it.sentence,
                    source_lens: "mixing",
                  }}
                />
              </div>
              <Field label="In your sentence">
                <p className="font-serif text-base text-ink-muted">{it.sentence}</p>
                <p className="mt-1 font-serif text-base text-ink">{it.rewritten_sentence}</p>
              </Field>
              <Field label="Why">{it.explanation}</Field>
              <Field label="Example">
                <FrenchExample>{it.example}</FrenchExample>
              </Field>
              {it.alternatives.length > 0 && (
                <Field label="Also possible">
                  <span className="font-serif text-base text-ink">{it.alternatives.join(" · ")}</span>
                </Field>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Complexity ----------

export function ComplexityView({
  result,
  draftId,
  analysisId,
  ...p
}: { result: ComplexityResult; draftId: string; analysisId: string } & ItemProps) {
  return (
    <div>
      <Summary>{result.summary}</Summary>

      {result.strengths.length > 0 && (
        <section className="mb-8">
          <h3 className="eyebrow mb-3">Structures you already use</h3>
          <ul className="space-y-2">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-l-2 border-sage/50 pl-4 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="text-sm text-ink-soft">{s.structure}</span>
                <span className="font-serif italic text-ink-muted">« {s.excerpt} »</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h3 className="eyebrow mb-2">Sentence variety</h3>
        <p className="text-sm leading-relaxed text-ink-soft">{result.sentence_variety}</p>
      </section>

      <h3 className="eyebrow mb-4">Opportunities</h3>
      {result.opportunities.length === 0 ? (
        <Empty>Your sentence construction already fits what you wanted to say. Nothing to add.</Empty>
      ) : (
        <div className="space-y-4">
          {result.opportunities.map((o, i) => (
            <Card key={i} index={i} {...p}>
              <Field label="Your sentence">
                <p className="font-serif text-lg text-ink-muted">{o.original_sentence}</p>
              </Field>
              <Field label="Another construction">
                <p className="font-serif text-lg text-ink">{o.suggestion}</p>
              </Field>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {o.structures.map((s) => (
                  <Chip key={s} tone="accent">
                    {s}
                  </Chip>
                ))}
              </div>
              <Field label="How it works">{o.explanation}</Field>
              <TryIt
                storageKey={`fwl.tryit.${analysisId}.${i}`}
                legacyKey={`fwl.tryit.${draftId}.${i}`}
                prompt={o.try_it}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Attempts are stored per analysis run, so a Re-analyze (which can reorder
 * opportunities) never shows an old attempt under a different suggestion.
 * Attempts saved before this change used a per-draft key; they are still shown
 * (and copied forward) rather than lost.
 */
function TryIt({ prompt, storageKey, legacyKey }: { prompt: string; storageKey: string; legacyKey: string }) {
  // Only rendered client-side after the analysis loads, so localStorage is available here.
  const [value, setValue] = useState(() => {
    try {
      const current = localStorage.getItem(storageKey);
      if (current !== null) return current;
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) localStorage.setItem(storageKey, legacy);
      return legacy ?? "";
    } catch {
      return "";
    }
  });
  const [open, setOpen] = useState(value !== "");
  return (
    <div className="mt-4 border-t border-rule pt-4">
      <p className="text-sm italic text-ink-soft">{prompt}</p>
      {open ? (
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            try {
              localStorage.setItem(storageKey, e.target.value);
            } catch {}
          }}
          autoFocus={!value}
          spellCheck={false}
          autoCorrect="off"
          rows={2}
          placeholder="Your version…"
          className="mt-3 w-full resize-y rounded-md border border-rule bg-paper px-3 py-2 font-serif text-base text-ink placeholder:italic placeholder:text-ink-faint focus:border-ink-faint focus:outline-none"
        />
      ) : (
        <button onClick={() => setOpen(true)} className="link-quiet mt-2 text-sm">
          Try it yourself
        </button>
      )}
    </div>
  );
}
