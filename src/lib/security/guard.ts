import "server-only";
import type { NextRequest } from "next/server";
import { isAiConfigured } from "@/lib/analysis/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ACCESS_COOKIE, accessPassword, protectionMode, verifySessionToken } from "./access";

export type GuardResult = { ok: true; identity: string } | { ok: false; status: number; error: string };

export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim() || "unknown";
}

/**
 * Rejects cross-site POSTs. Browsers send Origin on POST; a mismatch with our own
 * host means another site is trying to use the learner's cookie.
 */
export function isSameOrigin(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client: still needs a valid session below
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Decides whether this request may trigger an analysis, and who it counts against. */
export async function authorizeAnalysis(request: NextRequest): Promise<GuardResult> {
  switch (protectionMode()) {
    case "supabase": {
      const supabase = await getSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return { ok: false, status: 401, error: "Please sign in to analyze your writing." };
      return { ok: true, identity: `user:${data.user.id}` };
    }
    case "password": {
      const session = verifySessionToken(request.cookies.get(ACCESS_COOKIE)?.value, accessPassword()!);
      if (!session) return { ok: false, status: 401, error: "Your access has expired. Please enter the access password again." };
      return { ok: true, identity: `session:${session.sessionId}` };
    }
    case "none": {
      // Fail closed: a production deployment holding a Claude key must not be open to everyone.
      if (isAiConfigured() && process.env.NODE_ENV === "production") {
        return {
          ok: false,
          status: 503,
          error: "Analysis is locked until the site owner sets an access password (APP_ACCESS_PASSWORD) or connects accounts.",
        };
      }
      return { ok: true, identity: `ip:${clientIp(request)}` };
    }
  }
}
