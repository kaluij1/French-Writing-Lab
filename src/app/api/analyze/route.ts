import { NextResponse, type NextRequest } from "next/server";
import { AnalyzeRequestSchema } from "@/lib/analysis/schemas";
import { AnalysisError, analyzeDraft } from "@/lib/analysis/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Analyses can take a while with thinking enabled.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // When accounts are enabled, only signed-in learners may spend API credits.
  if (isSupabaseConfigured) {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "Please sign in to analyze your writing." }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === "text" && i.code === "too_big");
    return NextResponse.json(
      { error: tooLong ? "This draft is too long to analyze (20,000 characters max)." : "Invalid analysis request." },
      { status: 400 },
    );
  }

  const { text, lens } = parsed.data;
  if (!text.trim()) {
    return NextResponse.json({ error: "There is nothing to analyze yet." }, { status: 400 });
  }

  try {
    const analysis = await analyzeDraft(text, lens);
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message, retryable: error.retryable }, { status: error.status });
    }
    return NextResponse.json({ error: "Something went wrong while analyzing.", retryable: true }, { status: 500 });
  }
}
