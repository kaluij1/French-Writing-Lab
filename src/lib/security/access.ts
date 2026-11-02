import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Interim access protection for deployments without Supabase accounts.
 *
 * The owner sets APP_ACCESS_PASSWORD on the server. A correct password yields a
 * signed, HttpOnly session cookie. The signing key is derived from the password,
 * so changing the password invalidates every existing session.
 */

export const ACCESS_COOKIE = "fwl_access";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type ProtectionMode = "supabase" | "password" | "none";

export function accessPassword(): string | null {
  const p = process.env.APP_ACCESS_PASSWORD?.trim();
  return p ? p : null;
}

export function protectionMode(): ProtectionMode {
  if (isSupabaseConfigured) return "supabase";
  if (accessPassword()) return "password";
  return "none";
}

function signingKey(password: string): Buffer {
  return createHash("sha256").update(`fwl-access-v1:${password}`).digest();
}

function sign(payload: string, password: string): string {
  return createHmac("sha256", signingKey(password)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Compare a submitted password with the configured one in constant time. */
export function passwordMatches(input: string, password: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

/** Token format: `<sessionId>.<expiresAtUnix>.<hmac>` */
export function createSessionToken(password: string, now = Date.now()): string {
  const sid = randomBytes(16).toString("base64url");
  const exp = Math.floor(now / 1000) + SESSION_MAX_AGE_S;
  const payload = `${sid}.${exp}`;
  return `${payload}.${sign(payload, password)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  password: string,
  now = Date.now(),
): { sessionId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sid, expRaw, sig] = parts;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(sid) || !/^\d{1,12}$/.test(expRaw)) return null;
  if (!safeEqual(sig, sign(`${sid}.${expRaw}`, password))) return null;
  if (Number(expRaw) * 1000 <= now) return null;
  return { sessionId: sid };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}
