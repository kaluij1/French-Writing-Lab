/**
 * Small in-memory sliding-window rate limiter.
 *
 * Limitation: state lives in one server instance. On serverless platforms each
 * instance keeps its own counters, so this is a brake on abuse, not a hard cap.
 * The hard cap on spending is the monthly limit set in the Claude Console.
 */

export type Window = { windowMs: number; max: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windows: Window[],
    private readonly maxKeys = 10_000,
  ) {}

  /** Whether `key` is currently over a limit, without recording a hit. */
  peek(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
    const longest = Math.max(...this.windows.map((w) => w.windowMs));
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    for (const w of this.windows) {
      const inWindow = recent.filter((t) => now - t < w.windowMs);
      if (inWindow.length >= w.max) {
        return { ok: false, retryAfterS: Math.max(1, Math.ceil((inWindow[0] + w.windowMs - now) / 1000)) };
      }
    }
    return { ok: true };
  }

  /** Records a hit if allowed. Returns retryAfter (seconds) when blocked. */
  check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
    const longest = Math.max(...this.windows.map((w) => w.windowMs));
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < longest);

    for (const w of this.windows) {
      const inWindow = recent.filter((t) => now - t < w.windowMs);
      if (inWindow.length >= w.max) {
        const oldest = inWindow[0];
        this.hits.set(key, recent);
        return { ok: false, retryAfterS: Math.max(1, Math.ceil((oldest + w.windowMs - now) / 1000)) };
      }
    }

    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now, longest);
    return { ok: true };
  }

  private prune(now: number, longest: number) {
    for (const [k, ts] of this.hits) {
      if (!ts.some((t) => now - t < longest)) this.hits.delete(k);
    }
    // Still too many keys: drop the oldest entries rather than grow without bound.
    while (this.hits.size > this.maxKeys) {
      const first = this.hits.keys().next().value;
      if (first === undefined) break;
      this.hits.delete(first);
    }
  }
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Analysis requests per identity (signed-in user, access session or IP). */
export const analysisLimiter = new RateLimiter([
  { windowMs: 60_000, max: envInt("ANALYSIS_LIMIT_PER_MINUTE", 6) },
  { windowMs: 3_600_000, max: envInt("ANALYSIS_LIMIT_PER_HOUR", 40) },
]);

/** Failed password attempts per IP, to slow down guessing. Successful sign-ins are not counted. */
export const loginLimiter = new RateLimiter([{ windowMs: 15 * 60_000, max: 8 }]);
