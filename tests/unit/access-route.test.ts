import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "test-access-password";

async function load() {
  vi.resetModules();
  return import("@/app/api/access/route");
}

const login = (password: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/access", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": "203.0.113.7", ...headers },
    body: JSON.stringify({ password }),
  });

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("APP_ACCESS_PASSWORD", PASSWORD);
});

describe("POST /api/access", () => {
  it("sets an HttpOnly, SameSite=Lax cookie for the right password", async () => {
    const { POST } = await load();
    const res = await POST(login(PASSWORD));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/fwl_access=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toContain(PASSWORD);
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await load();
    expect((await POST(login(PASSWORD))).headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("rejects wrong passwords without setting a cookie", async () => {
    const { POST } = await load();
    for (const p of ["wrong", "", 42, null]) {
      const res = await POST(login(p, { "x-forwarded-for": "198.51.100.1" }));
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("limits guessing per IP", async () => {
    const { POST } = await load();
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await POST(login("guess" + i, { "x-forwarded-for": "192.0.2.50" }))).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
    // Even the right password is refused while blocked.
    expect((await POST(login(PASSWORD, { "x-forwarded-for": "192.0.2.50" }))).status).toBe(429);
  });

  it("does not count successful sign-ins against the limit", async () => {
    const { POST } = await load();
    for (let i = 0; i < 12; i++) expect((await POST(login(PASSWORD, { "x-forwarded-for": "192.0.2.77" }))).status).toBe(200);
  });

  it("is disabled when no password is configured", async () => {
    vi.stubEnv("APP_ACCESS_PASSWORD", "");
    const { POST } = await load();
    expect((await POST(login("anything"))).status).toBe(404);
  });
});
