"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { countWords, getStore, type Draft } from "@/lib/store";

const CURRENT_KEY = "fwl.currentDraftId";
const backupKey = (id: string | null) => `fwl.backup.${id ?? "new"}`;
const SAVE_DELAY_MS = 900;

type SaveState =
  | { kind: "empty" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

type Backup = { content: string; at: string };

function readBackup(id: string | null): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string | null, content: string) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ content, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable: the remote save still runs */
  }
}
function clearBackup(id: string | null) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {}
}

export function WritingWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get("draft");

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "empty" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Draft | null>(null);
  const textRef = useRef("");
  const lastSavedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const persistRef = useRef<() => Promise<void>>(async () => {});

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = getStore();
      let d: Draft | null = null;
      try {
        const id = requestedId ?? localStorage.getItem(CURRENT_KEY);
        if (id) d = await store.getDraft(id);
        // A finished (submitted) draft only reopens here when explicitly requested for revision.
        if (d && d.status === "submitted" && !requestedId) d = null;
      } catch (e) {
        console.error(e);
      }
      if (cancelled) return;

      let initial = d?.content ?? "";
      const backup = readBackup(d?.id ?? null);
      // Recover text typed after the last successful save (e.g. tab closed mid-save, offline).
      if (backup && backup.content !== initial && (!d || backup.at > d.updated_at)) initial = backup.content;

      draftRef.current = d;
      setDraft(d);
      textRef.current = initial;
      lastSavedRef.current = d?.content ?? "";
      setText(initial);
      if (d) localStorage.setItem(CURRENT_KEY, d.id);
      setSave(
        initial !== lastSavedRef.current
          ? { kind: "unsaved" }
          : d
            ? { kind: "saved", at: new Date(d.updated_at) }
            : { kind: "empty" },
      );
      // With Cache Components the page is kept alive (hidden) between visits, so state such as
      // "Submitting…" from a previous submission must be reset whenever the page is shown again.
      setSubmitting(false);
      setSubmitError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  // ---------- save ----------
  const persist = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inflightRef.current) await inflightRef.current;
    const content = textRef.current;
    if (content === lastSavedRef.current) return;

    const run = (async () => {
      setSave({ kind: "saving" });
      try {
        const store = getStore();
        let d = draftRef.current;
        if (!d) {
          d = await store.createDraft(content);
          clearBackup(null);
          localStorage.setItem(CURRENT_KEY, d.id);
          // Keep the URL clean but stable across refresh.
        } else {
          d = await store.updateDraftContent(d.id, content);
        }
        draftRef.current = d;
        setDraft(d);
        lastSavedRef.current = content;
        if (textRef.current === content) {
          clearBackup(d.id);
          setSave({ kind: "saved", at: new Date() });
        } else {
          writeBackup(d.id, textRef.current);
          setSave({ kind: "unsaved" });
        }
      } catch (e) {
        setSave({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not reach the server.",
        });
      }
    })();
    inflightRef.current = run;
    await run;
    inflightRef.current = null;
    if (textRef.current !== lastSavedRef.current && !timerRef.current) {
      timerRef.current = setTimeout(() => void persistRef.current(), SAVE_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  function onChange(value: string) {
    textRef.current = value;
    setText(value);
    setSubmitError(null);
    // Instant local backup, so nothing is lost even if the tab closes before the debounced save.
    writeBackup(draftRef.current?.id ?? null, value);
    if (value === lastSavedRef.current) {
      setSave(draftRef.current ? { kind: "saved", at: new Date(draftRef.current.updated_at) } : { kind: "empty" });
      return;
    }
    if (!value.trim() && !draftRef.current) {
      setSave({ kind: "empty" });
      return;
    }
    setSave((s) => (s.kind === "saving" ? s : { kind: "unsaved" }));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, SAVE_DELAY_MS);
  }

  // Save when leaving the tab; warn before closing with unsaved remote changes.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void persist();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (textRef.current !== lastSavedRef.current && getStore().mode === "supabase") {
        void persist();
        e.preventDefault();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void persist();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [persist]);

  // ---------- auto-grow editor ----------
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, window.innerHeight * 0.55)}px`;
  }, [text, loading]);

  // ---------- submit ----------
  async function submit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await persist();
      const d = draftRef.current;
      if (!d || textRef.current !== lastSavedRef.current) throw new Error("Your draft could not be saved yet. Please try again.");
      await getStore().submitDraft(d.id, textRef.current);
      clearBackup(d.id);
      localStorage.removeItem(CURRENT_KEY);
      router.push(`/drafts/${d.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit your draft.");
      setSubmitting(false);
    }
  }

  async function newPage() {
    await persist();
    localStorage.removeItem(CURRENT_KEY);
    draftRef.current = null;
    setDraft(null);
    textRef.current = "";
    lastSavedRef.current = "";
    setText("");
    setSave({ kind: "empty" });
    if (requestedId) router.replace("/");
    textareaRef.current?.focus();
  }

  const words = countWords(text);
  const revising = draft?.status === "submitted";

  return (
    <section className="animate-fade-in pt-6">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl font-light tracking-tight text-ink sm:text-5xl">
            {revising ? "Revising your draft." : "Your writing space."}
          </h1>
          {revising && (
            <p className="mt-3 max-w-xl text-sm text-ink-muted">
              Your original submission is kept exactly as you wrote it. When you are ready, analyze this revision.{" "}
              <Link href={`/drafts/${draft.id}`} className="link-quiet">
                Back to analysis
              </Link>
            </p>
          )}
        </div>
        {(draft || text) && !loading && (
          <button onClick={newPage} className="link-quiet shrink-0 text-sm no-underline hover:underline">
            New page
          </button>
        )}
      </div>

      <div className="border-t border-rule pt-8">
        <label htmlFor="editor" className="sr-only">
          Your draft
        </label>
        <textarea
          id="editor"
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void persist()}
          placeholder={loading ? "" : "Start writing in French..."}
          disabled={loading}
          autoFocus
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          className="prose-fr block w-full resize-none overflow-hidden bg-transparent text-[1.3rem] leading-[1.9] placeholder:text-ink-faint placeholder:italic focus:outline-none"
        />
      </div>

      <div className="sticky bottom-0 mt-10 -mx-2 flex flex-wrap items-center justify-between gap-4 border-t border-rule bg-paper/95 px-2 py-4 backdrop-blur">
        <div className="flex items-center gap-5 text-xs text-ink-muted">
          <span className="tabular-nums">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <SaveIndicator state={save} />
        </div>
        <div className="flex items-center gap-4">
          {submitError && <span className="text-xs text-terracotta">{submitError}</span>}
          <button onClick={submit} disabled={!text.trim() || submitting || loading} className="btn-primary">
            {submitting ? "Submitting…" : "Analyze my writing"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const dot = (cls: string) => <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} aria-hidden />;
  let content: React.ReactNode;
  switch (state.kind) {
    case "empty":
      content = <>{dot("bg-rule-strong")} Nothing to save yet</>;
      break;
    case "unsaved":
      content = <>{dot("bg-ochre")} Unsaved changes</>;
      break;
    case "saving":
      content = <>{dot("bg-ochre animate-pulse")} Saving…</>;
      break;
    case "saved":
      content = (
        <>
          {dot("bg-sage")} Saved{" "}
          {state.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </>
      );
      break;
    case "error":
      content = (
        <span title={state.message}>
          {dot("bg-terracotta")} Not saved to your account — kept on this device. Retrying when you type.
        </span>
      );
      break;
  }
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
      {content}
    </span>
  );
}
