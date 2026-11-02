import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The model is never called in unit tests: the service is replaced by a spy.
const analyzeDraft = vi.fn();
vi.mock("@/lib/analysis/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analysis/service")>("@/lib/analysis/service");
  return {
    AnalysisError: actual.AnalysisError,
    analyzeDraft: (...args: unknown[]) => analyzeDraft(...args),
    isAiConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  };
});

const PASSWORD = "test-access-password";

async function load() {
  vi.resetModules();
  const route = await import("@/app/api/analyze/route");
  const access = await import("@/lib/security/access");
  return { POST: route.POST, access };
}

function req(body: unknown, init: { cookie?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost:3000", ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

const ok = { text: "Je suis allé au marché.", lens: "grammar" };

beforeEach(() => {
  vi.unstubAllEnvs();
  analyzeDraft.mockReset();
  analyzeDraft.mockResolvedValue({ lens: "grammar", result: { summary: "", issues: [] }, demo: false, model: "m" });
});

describe("POST /api/analyze — password protection", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ACCESS_PASSWORD", PASSWORD);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  });

  it("rejects requests without a session cookie and never calls the model", async () => {
    const { POST } = await load();
    const res = await POST(req(ok));
    expect(res.status).toBe(401);
    expect(analyzeDraft).not.toHaveBeenCalled();
  });

  it("rejects a forged cookie", async () => {
    const { POST, access } = await load();
    const forged = access.createSessionToken("not-the-password");
    const res = await POST(req(ok, { cookie: `${access.ACCESS_COOKIE}=${forged}` }));
    expect(res.status).toBe(401);
    expect(analyzeDraft).not.toHaveBeenCalled();
  });

  it("accepts a valid session", async () => {
    const { POST, access } = await load();
    const res = await POST(req(ok, { cookie: `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}` }));
    expect(res.status).toBe(200);
    expect(analyzeDraft).toHaveBeenCalledTimes(1);
  });

  it("blocks cross-site requests even with a valid cookie", async () => {
    const { POST, access } = await load();
    const cookie = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    expect((await POST(req(ok, { cookie, headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await POST(req(ok, { cookie, headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(analyzeDraft).not.toHaveBeenCalled();
  });

  it("validates input and size", async () => {
    const { POST, access } = await load();
    const cookie = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    expect((await POST(req({ text: "x", lens: "poetry" }, { cookie }))).status).toBe(400);
    expect((await POST(req({ lens: "grammar" }, { cookie }))).status).toBe(400);
    expect((await POST(req(null, { cookie, raw: "{not json" }))).status).toBe(400);
    expect((await POST(req({ text: "   ", lens: "grammar" }, { cookie }))).status).toBe(400);
    expect((await POST(req({ text: "a".repeat(20_001), lens: "grammar" }, { cookie }))).status).toBe(413);
    expect((await POST(req(null, { cookie, raw: JSON.stringify({ text: "a", lens: "grammar", pad: "x".repeat(200_000) }) }))).status).toBe(413);
    expect((await POST(req(ok, { cookie, headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect(analyzeDraft).not.toHaveBeenCalled();
  });

  it("rate-limits per session and reports Retry-After", async () => {
    vi.stubEnv("ANALYSIS_LIMIT_PER_MINUTE", "3");
    const { POST, access } = await load();
    const cookie = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await POST(req({ ...ok, text: `Texte ${i}.` }, { cookie }))).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const blocked = await POST(req({ ...ok, text: "Encore." }, { cookie }));
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(analyzeDraft).toHaveBeenCalledTimes(3);
    // A different session has its own allowance.
    const other = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    expect((await POST(req(ok, { cookie: other }))).status).toBe(200);
  });

  it("coalesces identical concurrent requests into one model call", async () => {
    let release!: () => void;
    analyzeDraft.mockImplementation(
      () => new Promise((r) => (release = () => r({ lens: "grammar", result: { summary: "", issues: [] }, demo: false, model: "m" }))),
    );
    const { POST, access } = await load();
    const cookie = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    const a = POST(req(ok, { cookie }));
    const b = POST(req(ok, { cookie }));
    await vi.waitFor(() => expect(analyzeDraft).toHaveBeenCalledTimes(1));
    release();
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect(analyzeDraft).toHaveBeenCalledTimes(1);
  });

  it("returns safe messages for service errors without leaking details", async () => {
    const { AnalysisError } = await import("@/lib/analysis/service");
    const { POST, access } = await load();
    const cookie = `${access.ACCESS_COOKIE}=${access.createSessionToken(PASSWORD)}`;
    analyzeDraft.mockRejectedValueOnce(new AnalysisError("The analysis service is busy.", 429, true));
    let res = await POST(req(ok, { cookie }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "The analysis service is busy.", retryable: true });

    analyzeDraft.mockRejectedValueOnce(new Error("secret internal stack sk-ant-xyz"));
    res = await POST(req({ ...ok, text: "Autre." }, { cookie }));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("sk-ant");
    expect(body).not.toContain("stack");
  });
});

describe("POST /api/analyze — no protection configured", () => {
  it("fails closed in production when a Claude key is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const { POST } = await load();
    const res = await POST(req(ok));
    expect(res.status).toBe(503);
    expect(analyzeDraft).not.toHaveBeenCalled();
  });

  it("stays open for demo mode (no key), which never spends credits", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await load();
    expect((await POST(req(ok))).status).toBe(200);
  });
});
