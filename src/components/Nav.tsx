"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Write" },
  { href: "/drafts", label: "My Drafts" },
  { href: "/vocabulary", label: "My Vocabulary" },
];

export function Nav({ accounts, aiDemo }: { accounts: boolean; aiDemo: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname.startsWith("/login")) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const demoNote = [!accounts && "drafts saved in this browser", aiDemo && "sample analysis"].filter(Boolean).join(" · ");

  return (
    <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 pt-8 pb-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 sm:px-10">
      <Link href="/" className="font-serif text-xl tracking-tight text-ink">
        French Writing <span className="italic">Lab</span>
      </Link>
      <nav className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm sm:gap-8">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`transition-colors ${
              isActive(l.href)
                ? "text-ink underline decoration-ink-faint underline-offset-[6px]"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        ))}
        {demoNote && (
          <span
            title={`Demo mode: ${demoNote}. See README to connect Supabase and Claude.`}
            className="hidden rounded-full border border-rule px-2.5 py-0.5 text-[11px] text-ink-muted md:inline"
          >
            Demo mode
          </span>
        )}
        {accounts && (
          <button onClick={signOut} className="text-ink-faint transition-colors hover:text-ink">
            Sign out
          </button>
        )}
      </nav>
    </header>
  );
}
