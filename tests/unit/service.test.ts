import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, analyzeDraft, MAX_OUTPUT_TOKENS, modelForLens, setClientForTesting } from "@/lib/analysis/service";

const TEXT = "Je pense que il est là. Il y a beaucoup des gens.";

function fakeClient(impl: (params: Record<string, unknown>) => unknown) {
  const parse = vi.fn(async (params: Record<string, unknown>) => impl(params));
  setClientForTesting({ beta: { messages: { parse } } } as unknown as Anthropic);
  return parse;
}

const grammarOk = {
  summary: "s",
  issues: [
    {
      original: "que il",
      corrected: "qu'il",
      sentence: "Je pense que il est là.",
      kind: "error",
      category: "grammar",
      explanation: "e",
      rule: "Elision",
      example: "x",
      valid_alternatives: [],
      interpretations: [],
      confidence: "high",
    },
  ],
};

beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test"));
afterEach(() => {
  setClientForTesting(null);
  vi.unstubAllEnvs();
});

describe("analyzeDraft with Claude (mocked client)", () => {
  it("sends one bounded request for the chosen lens and adds validated locations", async () => {
    const parse = fakeClient(() => ({ stop_reason: "end_turn", model: "claude-haiku-5-5", parsed_output: grammarOk }));
    const res = await analyzeDraft(TEXT, "grammar");
    expect(parse).toHaveBeenCalledTimes(1);
    const params = parse.mock.calls[0][0] as { max_tokens: number; model: string; fallbacks?: unknown };
    expect(params.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.fallbacks).toBeUndefined(); // Haiku does not support server-side fallbacks
    expect(res.demo).toBe(false);
    const loc = res.result.locations![0]!;
    expect(TEXT.slice(loc.start, loc.end)).toBe("que il");
  });

  it("rejects output that does not match the schema", async () => {
    fakeClient(() => ({ stop_reason: "end_turn", model: "m", parsed_output: { summary: "s", issues: [{ original: 1 }] } }));
    await expect(analyzeDraft(TEXT, "grammar")).rejects.toMatchObject({ status: 502, retryable: true });
  });

  it("handles null parsed output", async () => {
    fakeClient(() => ({ stop_reason: "end_turn", model: "m", parsed_output: null }));
    await expect(analyzeDraft(TEXT, "grammar")).rejects.toBeInstanceOf(AnalysisError);
  });

  it("maps refusals and truncation to clear, non-retryable messages", async () => {
    fakeClient(() => ({ stop_reason: "refusal", model: "m", parsed_output: null }));
    await expect(analyzeDraft(TEXT, "grammar")).rejects.toMatchObject({ status: 422, retryable: false });
    fakeClient(() => ({ stop_reason: "max_tokens", model: "m", parsed_output: null }));
    await expect(analyzeDraft(TEXT, "grammar")).rejects.toMatchObject({ status: 413, retryable: false });
  });

  it("maps SDK errors without exposing internals", async () => {
    fakeClient(() => {
      throw new Anthropic.RateLimitError(429, {}, "internal detail", new Headers());
    });
    const e1 = await analyzeDraft(TEXT, "grammar").catch((e) => e);
    expect(e1).toMatchObject({ status: 429, retryable: true });
    expect(e1.message).not.toContain("internal detail");

    fakeClient(() => {
      throw new Anthropic.AuthenticationError(401, {}, "bad key sk-ant-xyz", new Headers());
    });
    const e2 = await analyzeDraft(TEXT, "grammar").catch((e) => e);
    expect(e2.message).toMatch(/API key is invalid/);
    expect(e2.message).not.toContain("sk-ant-xyz");

    fakeClient(() => {
      throw new Anthropic.APIConnectionError({ message: "ECONNRESET" });
    });
    await expect(analyzeDraft(TEXT, "grammar")).rejects.toMatchObject({ status: 503, retryable: true });
  });
});

describe("analyzeDraft without a key", () => {
  it("uses the demo analyzer and never constructs a client", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const parse = fakeClient(() => {
      throw new Error("must not be called");
    });
    const res = await analyzeDraft(TEXT, "grammar");
    expect(res.demo).toBe(true);
    expect(parse).not.toHaveBeenCalled();
    expect(res.result.locations?.length).toBe(res.result.issues.length);
  });
});

describe("model selection", () => {
  it("defaults every lens to Haiku and honours per-lens overrides", () => {
    expect(modelForLens("grammar")).toBe("claude-haiku-5-5");
    vi.stubEnv("ANTHROPIC_MODEL_COMPLEXITY", "claude-sonnet-5-5");
    expect(modelForLens("complexity")).toBe("claude-sonnet-5-5");
    expect(modelForLens("mixing")).toBe("claude-haiku-5-5");
  });

  it("sends server-side fallbacks only to models that support them", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_COMPLEXITY", "claude-sonnet-5-5");
    const parse = fakeClient(() => ({
      stop_reason: "end_turn",
      model: "claude-sonnet-5-5",
      parsed_output: { summary: "", strengths: [], sentence_variety: "", opportunities: [] },
    }));
    await analyzeDraft(TEXT, "complexity");
    expect(parse.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default" });
  });
});
