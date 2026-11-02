import { connection, NextResponse } from "next/server";
import { LENSES } from "@/lib/analysis/schemas";
import { isAiConfigured, modelForLens } from "@/lib/analysis/service";
import { protectionMode } from "@/lib/security/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Reports how this deployment is configured, without exposing any secret. */
export async function GET() {
  await connection(); // read environment variables at request time, not build time
  const ai = isAiConfigured();
  return NextResponse.json({
    ai,
    models: ai ? Object.fromEntries(LENSES.map((l) => [l, modelForLens(l)])) : null,
    accounts: isSupabaseConfigured,
    protection: protectionMode(),
  });
}
