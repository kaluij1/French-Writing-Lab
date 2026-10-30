"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-sm pt-32 text-center">
        <p className="font-serif text-2xl">Accounts are not configured.</p>
        <p className="mt-3 text-sm text-ink-muted">The app is running in demo mode; your work is saved in this browser.</p>
        <Link href="/" className="link-quiet mt-6 inline-block text-sm">
          Go to your writing space
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabaseBrowserClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setMessage({ tone: "info", text: "Check your email to confirm your account, then sign in." });
          setMode("signin");
        }
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-24 sm:pt-32">
      <p className="font-serif text-xl tracking-tight">
        French Writing <span className="italic">Lab</span>
      </p>
      <h1 className="mt-10 font-serif text-4xl font-light leading-tight">
        Think first.
        <br />
        Write freely.
        <br />
        <span className="italic text-ink-soft">Analyze afterward.</span>
      </h1>

      <form onSubmit={submit} className="mt-12 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field py-2.5"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field py-2.5"
        />
        <button disabled={busy} className="btn-primary w-full">
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {message && (
        <p className={`mt-4 text-sm ${message.tone === "error" ? "text-terracotta" : "text-ink-soft"}`}>{message.text}</p>
      )}

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMessage(null);
        }}
        className="link-quiet mt-8 text-sm"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
