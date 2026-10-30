import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompts";
import { LENS_SCHEMAS, type AnalysisResponse, type Lens, type LensResult } from "./schemas";
import { runDemoAnalysis } from "./demo";

// Claude Haiku 5.5 is the low-cost default. Set ANTHROPIC_MODEL=claude-sonnet-5-5 (or claude-opus-5-5) for deeper feedback.
export const ANALYSIS_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`). Haiku does not.
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 2 });
  return client;
}

/**
 * Reusable analysis service: one draft + one lens in, validated structured JSON out.
 * Falls back to the deterministic demo analyzer when no Claude API key is configured.
 */
export async function analyzeDraft<L extends Lens>(text: string, lens: L): Promise<AnalysisResponse<L>> {
  if (!isAiConfigured()) {
    return { lens, result: runDemoAnalysis(text, lens), demo: true, model: null };
  }

  const schema = LENS_SCHEMAS[lens];
  const fallback = SERVER_FALLBACK_MODELS.has(ANALYSIS_MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  try {
    const response = await getClient().beta.messages.parse({
      model: ANALYSIS_MODEL,
      max_tokens: 16000,
      ...fallback,
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(schema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(text, lens) }],
    });

    if (response.stop_reason === "refusal") {
      throw new AnalysisError("The analysis was declined for this text. Try editing the draft and analyzing again.", 422, false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new AnalysisError("The draft is too long to analyze in one pass. Try a shorter draft.", 413, false);
    }

    // parse() validates against the schema; re-validate defensively so the UI only ever sees well-formed data.
    const checked = schema.safeParse(response.parsed_output);
    if (!checked.success) {
      throw new AnalysisError("The analysis came back in an unexpected format. Please try again.", 502, true);
    }

    return { lens, result: checked.data as LensResult[L], demo: false, model: response.model };
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AnalysisError("The Claude API key is invalid or lacks access. Check ANTHROPIC_API_KEY.", 500, false);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalysisError("The analysis service is busy. Please wait a moment and try again.", 429, true);
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Claude bad request:", error.message);
      throw new AnalysisError("The analysis request was rejected. Please try again.", 400, false);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new AnalysisError("Could not reach the analysis service. Check your connection and try again.", 503, true);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}:`, error.message);
      throw new AnalysisError("The analysis service had a problem. Please try again.", 502, true);
    }
    console.error("Unexpected analysis error:", error);
    throw new AnalysisError("Something went wrong while analyzing. Please try again.", 500, true);
  }
}
