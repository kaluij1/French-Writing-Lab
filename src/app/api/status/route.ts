import { connection, NextResponse } from "next/server";
import { ANALYSIS_MODEL, isAiConfigured } from "@/lib/analysis/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Reports how this deployment is configured, without exposing any secret. */
export async function GET() {
  await connection(); // read environment variables at request time, not build time
  const ai = isAiConfigured();
  return NextResponse.json({ ai, model: ai ? ANALYSIS_MODEL : null, accounts: isSupabaseConfigured });
}
