"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStore, type Draft } from "@/lib/store";

function excerpt(d: Draft) {
  const t = (d.submitted_text ?? d.content).trim().replace(/\s+/g, " ");
  return t.length > 180 ? t.slice(0, 180).replace(/\s\S*$/, "") + "…" : t || "Empty page";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStore()
      .listDrafts()
      .then(setDrafts)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load drafts."));
  }, []);

  async function remove(d: Draft) {
    if (!confirm("Delete this draft and its analyses? This cannot be undone.")) return;
    try {
      await getStore().deleteDraft(d.id);
      setDrafts((all) => all?.filter((x) => x.id !== d.id) ?? null);
      try {
        if (localStorage.getItem("fwl.currentDraftId") === d.id) localStorage.removeItem("fwl.currentDraftId");
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the draft.");
    }
  }

  function newDraft() {
    try {
      localStorage.removeItem("fwl.currentDraftId");
    } catch {}
    router.push("/");
  }

  return (
    <section className="animate-fade-in pt-6">
      <div className="mb-10 flex items-end justify-between gap-6 border-b border-rule pb-6">
        <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">My drafts.</h1>
        <button onClick={newDraft} className="btn-quiet">
          New draft
        </button>
      </div>

      {error && <p className="mb-6 text-sm text-terracotta">{error}</p>}
      {!drafts && !error && <p className="text-sm text-ink-muted">Loading…</p>}
      {drafts?.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-serif text-xl text-ink-soft">No drafts yet.</p>
          <Link href="/" className="link-quiet mt-3 inline-block text-sm">
            Start writing
          </Link>
        </div>
      )}

      <ul className="divide-y divide-rule">
        {drafts?.map((d) => {
          const submitted = d.status === "submitted";
          const href = submitted ? `/drafts/${d.id}` : `/?draft=${d.id}`;
          return (
            <li key={d.id} className="group grid gap-3 py-7 sm:grid-cols-[1fr_auto] sm:gap-10">
              <Link href={href} className="block">
                <p className="font-serif text-lg leading-relaxed text-ink transition-colors group-hover:text-ink-soft">
                  {excerpt(d)}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>Created {fmt(d.created_at)}</span>
                  <span className="tabular-nums">{d.word_count} words</span>
                  <span>
                    {submitted
                      ? d.content !== d.submitted_text
                        ? "Submitted · revised since"
                        : "Submitted"
                      : "In progress"}
                  </span>
                </p>
              </Link>
              <div className="flex items-start gap-4 text-sm sm:flex-col sm:items-end sm:gap-2">
                {submitted ? (
                  <>
                    <Link href={`/drafts/${d.id}`} className="link-quiet">
                      View analysis
                    </Link>
                    <Link href={`/?draft=${d.id}`} className="link-quiet">
                      Continue editing
                    </Link>
                  </>
                ) : (
                  <Link href={`/?draft=${d.id}`} className="link-quiet">
                    Continue writing
                  </Link>
                )}
                <button
                  onClick={() => remove(d)}
                  className="text-ink-faint opacity-0 transition-opacity hover:text-terracotta focus:opacity-100 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
