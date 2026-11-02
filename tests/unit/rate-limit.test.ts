import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/security/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks with a retry delay", () => {
    const rl = new RateLimiter([{ windowMs: 60_000, max: 3 }]);
    const t = 1_000_000;
    expect(rl.check("a", t).ok).toBe(true);
    expect(rl.check("a", t + 1).ok).toBe(true);
    expect(rl.check("a", t + 2).ok).toBe(true);
    const blocked = rl.check("a", t + 3);
    expect(blocked).toEqual({ ok: false, retryAfterS: 60 });
  });

  it("keeps identities separate", () => {
    const rl = new RateLimiter([{ windowMs: 60_000, max: 1 }]);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("b", 0).ok).toBe(true);
    expect(rl.check("a", 1).ok).toBe(false);
  });

  it("slides the window", () => {
    const rl = new RateLimiter([{ windowMs: 1_000, max: 1 }]);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 999).ok).toBe(false);
    expect(rl.check("a", 1_001).ok).toBe(true);
  });

  it("enforces every window", () => {
    const rl = new RateLimiter([
      { windowMs: 1_000, max: 10 },
      { windowMs: 60_000, max: 2 },
    ]);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 5_000).ok).toBe(true);
    expect(rl.check("a", 10_000).ok).toBe(false);
  });

  it("peek reports state without recording a hit", () => {
    const rl = new RateLimiter([{ windowMs: 60_000, max: 1 }]);
    expect(rl.peek("a", 0).ok).toBe(true);
    expect(rl.peek("a", 0).ok).toBe(true);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.peek("a", 1).ok).toBe(false);
  });

  it("does not grow without bound", () => {
    const rl = new RateLimiter([{ windowMs: 1_000, max: 1 }], 50);
    for (let i = 0; i < 500; i++) rl.check(`k${i}`, i * 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rl as any).hits.size).toBeLessThanOrEqual(50);
  });
});
