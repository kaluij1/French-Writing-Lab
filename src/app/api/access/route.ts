import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  accessPassword,
  createSessionToken,
  passwordMatches,
  protectionMode,
  sessionCookieOptions,
} from "@/lib/security/access";
import { clientIp, isSameOrigin } from "@/lib/security/guard";
import { loginLimiter } from "@/lib/security/rate-limit";

/** Exchange the access password for an HttpOnly session cookie. */
export async function POST(request: NextRequest) {
  if (protectionMode() !== "password") {
    return NextResponse.json({ error: "Password access is not enabled." }, { status: 404 });
  }
  if (!isSameOrigin(request)) return NextResponse.json({ error: "This request was blocked." }, { status: 403 });

  const ip = clientIp(request);
  const limit = loginLimiter.peek(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Please wait ${Math.ceil(limit.retryAfterS / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string" && body.password.length <= 512) password = body.password;
  } catch {
    /* falls through to the generic error */
  }

  const expected = accessPassword()!;
  if (!password || !passwordMatches(password, expected)) {
    loginLimiter.check(ip); // only failures count towards the limit
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, createSessionToken(expected), sessionCookieOptions());
  return res;
}

/** Forget this browser's access session. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "This request was blocked." }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
