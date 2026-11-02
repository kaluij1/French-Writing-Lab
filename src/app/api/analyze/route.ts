import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AnalyzeRequestSchema, type AnalysisResponse } from "@/lib/analysis/schemas";
import { AnalysisError, analyzeDraft } from "@/lib/analysis/service";
import { authorizeAnalysis, isSameOrigin } from "@/lib/security/guard";
import { analysisLimiter } from "@/lib/security/rate-limit";

// Analyses can take a while with thinking enabled.
export const maxDuration = 120;

/** Hard cap on the raw request body; a 20,000-character draft is well under this. */
const MAX_BODY_BYTES = 100_000;

/** Identical requests already running on this instance share one model call. */
const inFlight = new Map<string, Promise<AnalysisResponse>>();

const fail = (status: number, error: string, extra?: Record<string, unknown>, headers?: HeadersInit) =>
  NextResponse.json({ error, ...extra }, { status, headers });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "This request was blocked.");

  const auth = await authorizeAnalysis(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "Invalid request format.");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "This draft is too long to analyze (20,000 characters max).");

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, "Invalid request body.");
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return fail(413, "This draft is too long to analyze (20,000 characters max).");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Invalid request body.");
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === "text" && i.code === "too_big");
    return tooLong
      ? fail(413, "This draft is too long to analyze (20,000 characters max).")
      : fail(400, "Invalid analysis request.");
  }

  const { text, lens } = parsed.data;
  if (!text.trim()) return fail(400, "There is nothing to analyze yet.");

  const key = `${auth.identity}|${lens}|${createHash("sha256").update(text).digest("base64url")}`;
  let job = inFlight.get(key);
  if (!job) {
    // Duplicate requests (double clicks, retries while running) join the running job and are not rate-limited twice.
    const limit = analysisLimiter.check(auth.identity);
    if (!limit.ok) {
      return fail(
        429,
        `You've run a lot of analyses in a short time. Please wait ${limit.retryAfterS} seconds and try again.`,
        { retryable: true },
        { "Retry-After": String(limit.retryAfterS) },
      );
    }
    job = analyzeDraft(text, lens);
    inFlight.set(key, job);
    void job.finally(() => inFlight.delete(key)).catch(() => {});
  }

  try {
    return NextResponse.json(await job);
  } catch (error) {
    if (error instanceof AnalysisError) {
      return fail(error.status, error.message, { retryable: error.retryable });
    }
    console.error("Unexpected analysis failure");
    return fail(500, "Something went wrong while analyzing.", { retryable: true });
  }
}
