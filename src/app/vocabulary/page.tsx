"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStore, type VocabItem } from "@/lib/store";

type Filter = "all" | "to_review" | "reviewed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "to_review", label: "To review" },
  { id: "reviewed", label: "Reviewed" },
];

const SOURCE_LABEL: Record<VocabItem["source_lens"], string> = {
  mixing: "From language mixing",
  vocabulary: "From vocabulary",
  grammar: "From grammar",
  complexity: "From complexity",
  manual: "Added by you",
};

export default function VocabularyPage() {
  const [items, setItems] = useState<VocabItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getStore()
      .listVocab()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your vocabulary."));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((v) => {
      if (filter === "to_review" && v.reviewed) return false;
      if (filter === "reviewed" && !v.reviewed) return false;
      if (!q) return true;
      return [v.french, v.english, v.explanation, v.source_sentence].some((f) => f.toLowerCase().includes(q));
    });
  }, [items, query, filter]);

  async function toggleReviewed(v: VocabItem) {
    setItems((all) => all?.map((x) => (x.id === v.id ? { ...x, reviewed: !v.reviewed } : x)) ?? null);
    try {
      await getStore().updateVocab(v.id, { reviewed: !v.reviewed });
    } catch (e) {
      setItems((all) => all?.map((x) => (x.id === v.id ? v : x)) ?? null);
      setError(e instanceof Error ? e.message : "Could not update.");
    }
  }

  async function remove(v: VocabItem) {
    if (!confirm(`Remove “${v.french}” from your vocabulary?`)) return;
    try {
      await getStore().deleteVocab(v.id);
      setItems((all) => all?.filter((x) => x.id !== v.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
    }
  }

  const toReview = items?.filter((v) => !v.reviewed).length ?? 0;

  return (
    <section className="animate-fade-in pt-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">My vocabulary.</h1>
          {items && items.length > 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              {items.length} {items.length === 1 ? "expression" : "expressions"} · {toReview} to review
            </p>
          )}
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn-quiet">
          {adding ? "Close" : "Add a word"}
        </button>
      </div>

      {adding && (
        <AddForm
          onAdded={(row) => {
            setItems((all) => [row, ...(all ?? [])]);
            setAdding(false);
          }}
        />
      )}

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search French, English or context…"
          className="field max-w-sm"
          aria-label="Search vocabulary"
        />
        <div className="flex gap-1 text-sm" role="radiogroup" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 transition-colors ${
                filter === f.id ? "bg-paper-sunk text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-terracotta">{error}</p>}
      {!items && !error && <p className="text-sm text-ink-muted">Loading…</p>}
      {items?.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-serif text-xl text-ink-soft">Your vocabulary is empty.</p>
          <p className="mt-2 text-sm text-ink-muted">
            Save words from the Vocabulary and Language mixing lenses after analyzing a{" "}
            <Link href="/drafts" className="link-quiet">
              draft
            </Link>
            .
          </p>
        </div>
      )}
      {items && items.length > 0 && visible.length === 0 && (
        <p className="py-10 text-sm text-ink-muted">Nothing matches this search.</p>
      )}

      <ul className="divide-y divide-rule">
        {visible.map((v) => (
          <li key={v.id} className="group grid gap-4 py-6 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:gap-8">
            <div>
              <p className={`font-serif text-xl ${v.reviewed ? "text-ink-muted" : "text-ink"}`}>{v.french}</p>
              {v.english && <p className="mt-0.5 text-sm text-ink-muted">{v.english}</p>}
            </div>
            <div className="text-sm leading-relaxed text-ink-soft">
              {v.explanation && <p>{v.explanation}</p>}
              {v.source_sentence && (
                <p className="mt-2 font-serif text-base italic text-ink-muted">« {v.source_sentence} »</p>
              )}
              <p className="mt-2 text-xs text-ink-faint">
                {SOURCE_LABEL[v.source_lens]} ·{" "}
                {new Date(v.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                {v.draft_id && (
                  <>
                    {" · "}
                    <Link href={`/drafts/${v.draft_id}`} className="hover:text-ink">
                      open draft
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-start gap-4 text-sm sm:flex-col sm:items-end sm:gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-ink-muted">
                <input
                  type="checkbox"
                  checked={v.reviewed}
                  onChange={() => toggleReviewed(v)}
                  className="h-3.5 w-3.5 accent-[var(--color-sage)]"
                />
                Reviewed
              </label>
              <button
                onClick={() => remove(v)}
                className="text-ink-faint opacity-0 transition-opacity hover:text-terracotta focus:opacity-100 group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddForm({ onAdded }: { onAdded: (row: VocabItem) => void }) {
  const [french, setFrench] = useState("");
  const [english, setEnglish] = useState("");
  const [explanation, setExplanation] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!french.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const row = await getStore().addVocab({
        french: french.trim(),
        english: english.trim(),
        explanation: explanation.trim(),
        source_sentence: sentence.trim(),
        draft_id: null,
        source_lens: "manual",
      });
      onAdded(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="animate-fade-in mb-10 grid gap-3 rounded-lg border border-rule bg-paper-raised p-5 sm:grid-cols-2">
      <input className="field font-serif text-base" placeholder="French word or expression" value={french} onChange={(e) => setFrench(e.target.value)} required autoFocus />
      <input className="field" placeholder="English translation" value={english} onChange={(e) => setEnglish(e.target.value)} />
      <input className="field sm:col-span-2" placeholder="Context or note (optional)" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      <input className="field font-serif text-base sm:col-span-2" placeholder="Example sentence (optional)" value={sentence} onChange={(e) => setSentence(e.target.value)} />
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn-primary" disabled={busy || !french.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
        {err && <span className="text-xs text-terracotta">{err}</span>}
      </div>
    </form>
  );
}
