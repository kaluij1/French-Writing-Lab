import { describe, expect, it } from "vitest";
import { createSessionToken, passwordMatches, SESSION_MAX_AGE_S, verifySessionToken } from "@/lib/security/access";

describe("access session tokens", () => {
  const pw = "correct horse battery staple";

  it("accepts a token it signed", () => {
    const token = createSessionToken(pw);
    expect(verifySessionToken(token, pw)).toMatchObject({ sessionId: expect.any(String) });
  });

  it("rejects a tampered signature, session id or expiry", () => {
    const [sid, exp, sig] = createSessionToken(pw).split(".");
    expect(verifySessionToken(`${sid}.${exp}.${sig.slice(0, -2)}xx`, pw)).toBeNull();
    expect(verifySessionToken(`${sid}A.${exp}.${sig}`, pw)).toBeNull();
    expect(verifySessionToken(`${sid}.${Number(exp) + 999999}.${sig}`, pw)).toBeNull();
  });

  it("rejects tokens after the password changes", () => {
    expect(verifySessionToken(createSessionToken(pw), "a different password")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const issued = Date.now() - (SESSION_MAX_AGE_S + 60) * 1000;
    expect(verifySessionToken(createSessionToken(pw, issued), pw)).toBeNull();
  });

  it("rejects garbage", () => {
    for (const t of [undefined, null, "", "a.b", "a.b.c.d", "!!!.123.abc"]) expect(verifySessionToken(t, pw)).toBeNull();
  });

  it("compares passwords exactly", () => {
    expect(passwordMatches(pw, pw)).toBe(true);
    expect(passwordMatches(pw + " ", pw)).toBe(false);
    expect(passwordMatches("", pw)).toBe(false);
  });
});
