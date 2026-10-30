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
  verb_conjugation: "Verb conjugation",
  tense: "Tense",
  agreement: "Agreement",
  article: "Article",
  preposition: "Preposition",
  pronoun_placement: "Pronoun placement",
  sentence_construction: "Sentence construction",
  word_order: "Word order",
  elision: "Elision",
  other: "Other",
};

export function GrammarView({ result, ...p }: { result: GrammarResult } & ItemProps) {
  return (
    <div>
      <Summary>{result.summary}</Summary>
      {result.issues.length === 0 ? (
        <Empty>No grammatical errors found. Stylistic suggestions live in the other lenses.</Empty>
      ) : (
        <div className="space-y-4">
          {result.issues.map((it, i) => (
            <Card key={i} index={i} {...p}>
              <Chip tone="accent">{CATEGORY_LABEL[it.category] ?? it.category}</Chip>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-lg">
                <span className="text-ink-muted line-through decoration-terracotta/70 decoration-1">{it.original}</span>
                <span className="text-ink-faint" aria-hidden>
                  →
                </span>
                <span className="text-ink">{it.corrected}</span>
              </div>
              <Field label="Why">{it.explanation}</Field>
              <Field label="Rule · example">
                <span className="mr-2 text-ink-soft">{it.rule}.</span>
                <FrenchExample>{it.example}</FrenchExample>
              </Field>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Vocabulary ----------

const KIND_HEADINGS: Record<VocabularyItem["kind"], string> = {
  english_word: "Words you wrote in English",
  incorrect_choice: "Word choice",
  repetition: "Repetition",
  more_precise: "More precise expressions",
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
  const order: VocabularyItem["kind"][] = ["english_word", "incorrect_choice", "more_precise", "repetition"];
  const sentences = splitSentences(text);
  return (
    <div>
      <Summary>{result.summary}</Summary>
      {order.map((kind) => {
        const entries = result.items.map((it, i) => ({ it, i })).filter((x) => x.it.kind === kind);
        if (!entries.length) return null;
        return (
          <section key={kind} className="mb-10">
            <h3 className="eyebrow mb-4">{KIND_HEADINGS[kind]}</h3>
            <div className="space-y-4">
              {entries.map(({ it, i }) => {
                const sentence = sentences.find((s) => s.includes(it.original)) ?? "";
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

export function ComplexityView({ result, draftId, ...p }: { result: ComplexityResult; draftId: string } & ItemProps) {
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
              <TryIt storageKey={`fwl.tryit.${draftId}.${i}`} prompt={o.try_it} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TryIt({ prompt, storageKey }: { prompt: string; storageKey: string }) {
  // Only rendered client-side after the analysis loads, so localStorage is available here.
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
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
