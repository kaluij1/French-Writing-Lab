"use client";

import { useState } from "react";

/** Interim access screen, shown when the site is protected by APP_ACCESS_PASSWORD. */
export default function AccessPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not check the password.");
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only follow same-site relative paths.
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the password.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-24 sm:pt-32">
      <h1 className="font-serif text-4xl font-light leading-tight">
        Think first.
        <br />
        Write freely.
        <br />
        <span className="italic text-ink-soft">Analyze afterward.</span>
      </h1>
      <form onSubmit={submit} className="mt-12 space-y-3">
        <label htmlFor="access-password" className="eyebrow block">
          Access password
        </label>
        <input
          id="access-password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field py-2.5"
        />
        <button disabled={busy || !password} className="btn-primary w-full">
          {busy ? "One moment…" : "Enter"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}
