"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LENS_LABELS, LENSES, type AnalysisResponse, type Lens } from "@/lib/analysis/schemas";
import { getStore, type Draft, type DraftAnalysis, type VocabItem } from "@/lib/store";
import { HighlightedText } from "./HighlightedText";
import { ComplexityView, GrammarView, MixingView, VocabularyView, type SaveVocabInput } from "./LensViews";

type LensState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "done"; analysis: DraftAnalysis };

const LENS_DOT: Record<Lens, string> = {
  grammar: "bg-terracotta",
  vocabulary: "bg-sage",
  mixing: "bg-slate",
  complexity: "bg-ochre",
};

function excerptsFor(a: DraftAnalysis | null): string[] {
  if (!a) return [];
  switch (a.lens) {
    case "grammar":
      return (a as DraftAnalysis<"grammar">).result.issues.map((x) => x.original);
    case "vocabulary":
      return (a as DraftAnalysis<"vocabulary">).result.items.map((x) => x.original);
    case "mixing":
      return (a as DraftAnalysis<"mixing">).result.insertions.map((x) => x.original);
    case "complexity":
      return (a as DraftAnalysis<"complexity">).result.opportunities.map((x) => x.original_sentence);
  }
}

function countFor(a: DraftAnalysis): number {
  return excerptsFor(a).length;
}

export function AnalysisWorkspace({ draftId }: { draftId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lenses, setLenses] = useState<Record<Lens, LensState>>({
    grammar: { status: "idle" },
    vocabulary: { status: "idle" },
    mixing: { status: "idle" },
    complexity: { status: "idle" },
  });
  const lensParam = params.get("lens");
  const urlLens = lensParam && (LENSES as readonly string[]).includes(lensParam) ? (lensParam as Lens) : null;
  const [active, setActive] = useState<Lens | null>(urlLens);
  const [activeItem, setActiveItem] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // ---------- run a lens ----------
  const runLens = useCallback(async (d: Draft, lens: Lens) => {
    if (!d.submitted_text) return;
    const text = d.submitted_text;
    setLenses((s) => ({ ...s, [lens]: { status: "loading" } }));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lens }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        throw Object.assign(new Error(body?.error ?? "The analysis failed. Please try again."), {
          retryable: body?.retryable ?? true,
        });
      }
      const data = body as AnalysisResponse;
      const saved = await getStore().saveAnalysis({
        draft_id: d.id,
        lens,
        source_text: text,
        result: data.result,
        demo: data.demo,
        model: data.model,
      });
      setLenses((s) => ({ ...s, [lens]: { status: "done", analysis: saved } }));
    } catch (e) {
      const err = e as Error & { retryable?: boolean };
      setLenses((s) => ({
        ...s,
        [lens]: { status: "error", message: err.message || "The analysis failed.", retryable: err.retryable ?? true },
      }));
    }
  }, []);

  // ---------- load draft, saved analyses and vocabulary ----------
  useEffect(() => {
    (async () => {
      try {
        const store = getStore();
        const [d, analyses, v] = await Promise.all([store.getDraft(draftId), store.listAnalyses(draftId), store.listVocab()]);
        setDraft(d);
        setVocab(v);
        if (d?.submitted_text) {
          const next: Partial<Record<Lens, LensState>> = {};
          // analyses are newest first; keep the latest per lens for the current submission
          for (const a of analyses) {
            if (a.source_text === d.submitted_text && !next[a.lens]) next[a.lens] = { status: "done", analysis: a };
          }
          setLenses((prev) => ({ ...prev, ...next }));
          // A lens named in the URL (e.g. after refresh) runs only if it has no saved result.
          if (urlLens && !next[urlLens]) void runLens(d, urlLens);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load this draft.");
      } finally {
        setLoaded(true);
      }
    })();
    // The URL lens is only read on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, runLens]);

  function selectLens(lens: Lens) {
    setActive(lens);
    setActiveItem(null);
    setShowOriginal(false);
    const url = new URL(window.location.href);
    url.searchParams.set("lens", lens);
    window.history.replaceState(null, "", url);
    // Only run the lens the learner actually chose, and only once per submission.
    if (draft && lenses[lens].status === "idle") void runLens(draft, lens);
  }

  // ---------- vocabulary ----------
  const savedFrench = useMemo(
    () => new Set(vocab.filter((v) => v.draft_id === draftId).map((v) => v.french.trim().toLowerCase())),
    [vocab, draftId],
  );
  const isSaved = useCallback((french: string) => savedFrench.has(french.trim().toLowerCase()), [savedFrench]);
  const onSave = useCallback(
    async (item: SaveVocabInput) => {
      try {
        const row = await getStore().addVocab({ ...item, draft_id: draftId });
        setVocab((v) => [row, ...v]);
        setToast(`“${row.french}” saved to your vocabulary`);
        setTimeout(() => setToast(null), 2600);
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Could not save.");
        setTimeout(() => setToast(null), 3500);
        throw e;
      }
    },
    [draftId],
  );

  // ---------- highlight <-> card linking ----------
  const activeState = active ? lenses[active] : null;
  const activeAnalysis = activeState?.status === "done" ? activeState.analysis : null;
  const excerpts = useMemo(() => excerptsFor(activeAnalysis), [activeAnalysis]);

  function onMarkSelect(index: number) {
    setActiveItem(index);
    const el = document.getElementById(`item-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.classList.remove("animate-flash");
    void el?.offsetWidth;
    el?.classList.add("animate-flash");
  }

  // ---------- render ----------
  if (!loaded) return <p className="pt-16 text-sm text-ink-muted">Opening your draft…</p>;
  if (loadError) return <Notice title="This draft could not be opened.">{loadError}</Notice>;
  if (!draft) return <Notice title="Draft not found.">It may have been deleted.</Notice>;
  if (!draft.submitted_text)
    return (
      <Notice title="This draft hasn’t been submitted yet.">
        Finish writing first; analysis comes afterwards.{" "}
        <Link className="link-quiet" href={`/?draft=${draft.id}`}>
          Continue writing
        </Link>
      </Notice>
    );

  const hasRevision = draft.original_text !== null && draft.original_text !== draft.submitted_text;
  const hasUnsubmittedEdits = draft.content !== draft.submitted_text;
  const displayed = showOriginal && draft.original_text ? draft.original_text : draft.submitted_text;
  const submittedAt = draft.submitted_at ? new Date(draft.submitted_at) : new Date(draft.created_at);

  async function analyzeRevision() {
    if (!draft) return;
    const d = await getStore().submitDraft(draft.id, draft.content);
    setDraft(d);
    setLenses({
      grammar: { status: "idle" },
      vocabulary: { status: "idle" },
      mixing: { status: "idle" },
      complexity: { status: "idle" },
    });
    setActive(null);
    router.refresh();
  }

  return (
    <div className="animate-fade-in pt-6">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="eyebrow mb-2">
            Submitted {submittedAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} ·{" "}
            {draft.word_count} words
          </p>
          <h1 className="font-serif text-4xl font-light tracking-tight">Reading your draft.</h1>
        </div>
        <div className="flex items-center gap-5 text-sm">
          {hasUnsubmittedEdits && (
            <button onClick={analyzeRevision} className="link-quiet">
              Analyze latest revision
            </button>
          )}
          <Link href={`/?draft=${draft.id}`} className="btn-quiet">
            Continue editing
          </Link>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        {/* Draft, exactly as submitted */}
        <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
          <div className="mb-4 flex items-center justify-between">
            <span className="eyebrow">{showOriginal ? "Original submission" : "Your text"}</span>
            {hasRevision && (
              <button onClick={() => setShowOriginal((v) => !v)} className="link-quiet text-xs">
                {showOriginal ? "Show analysed version" : "Show original submission"}
              </button>
            )}
          </div>
          <HighlightedText
            text={displayed}
            excerpts={showOriginal ? [] : excerpts}
            lens={showOriginal ? null : active}
            activeIndex={activeItem}
            onSelect={onMarkSelect}
          />
          {activeAnalysis && excerpts.length > 0 && !showOriginal && (
            <p className="mt-6 text-xs text-ink-faint">Click a highlighted passage to see its explanation.</p>
          )}
        </div>

        {/* Lenses */}
        <div>
          <div role="tablist" aria-label="Analysis lenses" className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LENSES.map((lens) => {
              const s = lenses[lens];
              const selected = active === lens;
              return (
                <button
                  key={lens}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectLens(lens)}
                  className={`group rounded-lg border px-3 py-3 text-left transition-colors ${
                    selected ? "border-ink-faint bg-paper-raised" : "border-rule hover:border-rule-strong"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <span className={`h-1.5 w-1.5 rounded-full ${LENS_DOT[lens]}`} aria-hidden />
                    {LENS_LABELS[lens].title}
                  </span>
                  <span className="mt-1 block text-[11px] text-ink-muted">
                    {s.status === "loading"
                      ? "Reading…"
                      : s.status === "done"
                        ? `${countFor(s.analysis)} ${countFor(s.analysis) === 1 ? "note" : "notes"}`
                        : s.status === "error"
                          ? "Needs retry"
                          : "Not yet opened"}
                  </span>
                </button>
              );
            })}
          </div>

          {!active && (
            <div className="animate-fade-in">
              <p className="mb-6 font-serif text-xl leading-relaxed text-ink-soft">
                Choose a lens to look at your writing from one angle at a time. Each lens runs only when you open it,
                and your text stays exactly as you wrote it.
              </p>
              <ul className="space-y-4">
                {LENSES.map((l) => (
                  <li key={l}>
                    <button onClick={() => selectLens(l)} className="group flex w-full items-baseline gap-3 text-left">
                      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${LENS_DOT[l]}`} aria-hidden />
                      <span>
                        <span className="text-ink group-hover:underline group-hover:decoration-ink-faint group-hover:underline-offset-4">
                          {LENS_LABELS[l].title}
                        </span>
                        <span className="block text-sm text-ink-muted">{LENS_LABELS[l].blurb}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active && activeState && (
            <div key={active} className="animate-fade-in">
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-2xl">{LENS_LABELS[active].title}</h2>
                {activeState.status === "done" && (
                  <button onClick={() => runLens(draft, active)} className="link-quiet text-xs">
                    Re-analyze
                  </button>
                )}
              </div>

              {activeState.status === "loading" && <LoadingLens />}
              {activeState.status === "error" && (
                <div className="rounded-lg border border-terracotta/30 bg-terracotta-wash/40 px-5 py-4 text-sm text-ink-soft">
                  <p>{activeState.message}</p>
                  {activeState.retryable && (
                    <button onClick={() => runLens(draft, active)} className="link-quiet mt-2">
                      Try again
                    </button>
                  )}
                </div>
              )}
              {activeState.status === "done" && (
                <>
                  {activeState.analysis.demo && (
                    <p className="mb-6 rounded-md bg-paper-sunk px-4 py-2.5 text-xs leading-relaxed text-ink-muted">
                      Demo analysis: produced by a simple built-in rule set because no Claude API key is configured.
                      Add <code className="font-mono">ANTHROPIC_API_KEY</code> for a full reading.
                    </p>
                  )}
                  <LensResultView
                    analysis={activeState.analysis}
                    text={draft.submitted_text}
                    draftId={draft.id}
                    activeIndex={activeItem}
                    setActive={setActiveItem}
                    isSaved={isSaved}
                    onSave={onSave}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="animate-fade-in fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-soft"
        >
          {toast}{" "}
          <Link href="/vocabulary" className="ml-2 underline decoration-paper/40 underline-offset-4">
            View
          </Link>
        </div>
      )}
    </div>
  );
}

function LensResultView({
  analysis,
  text,
  draftId,
  ...rest
}: {
  analysis: DraftAnalysis;
  text: string;
  draftId: string;
  activeIndex: number | null;
  setActive: (i: number | null) => void;
  isSaved: (f: string) => boolean;
  onSave: (i: SaveVocabInput) => Promise<void>;
}) {
  switch (analysis.lens) {
    case "grammar":
      return <GrammarView result={(analysis as DraftAnalysis<"grammar">).result} {...rest} />;
    case "vocabulary":
      return <VocabularyView result={(analysis as DraftAnalysis<"vocabulary">).result} text={text} {...rest} />;
    case "mixing":
      return <MixingView result={(analysis as DraftAnalysis<"mixing">).result} {...rest} />;
    case "complexity":
      return <ComplexityView result={(analysis as DraftAnalysis<"complexity">).result} draftId={draftId} {...rest} />;
  }
}

function LoadingLens() {
  return (
    <div aria-busy className="space-y-4">
      <p className="text-sm text-ink-muted">Reading your draft carefully. This can take up to a minute.</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-rule px-5 py-5">
          <div className="h-3 w-24 rounded bg-paper-sunk" />
          <div className="mt-4 h-4 w-3/4 rounded bg-paper-sunk" />
          <div className="mt-3 h-3 w-full rounded bg-paper-sunk" />
          <div className="mt-2 h-3 w-5/6 rounded bg-paper-sunk" />
        </div>
      ))}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-16">
      <h1 className="font-serif text-3xl font-light">{title}</h1>
      <p className="mt-3 text-sm text-ink-muted">{children}</p>
      <Link href="/drafts" className="link-quiet mt-6 inline-block text-sm">
        Back to my drafts
      </Link>
    </div>
  );
}
