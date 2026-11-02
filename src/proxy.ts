import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessPassword, protectionMode, verifySessionToken } from "@/lib/security/access";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Page-level gate. API routes are not redirected here: each one enforces access
 * itself and answers with a JSON 401, so the proxy is never the only protection.
 *
 * - Supabase mode: refresh the session cookie, send signed-out visitors to /login.
 * - Password mode: send visitors without a valid access cookie to /access.
 * - No protection configured: pass through (demo mode).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const mode = protectionMode();

  if (mode === "password") {
    if (path.startsWith("/api") || path.startsWith("/access")) return NextResponse.next();
    const ok = verifySessionToken(request.cookies.get(ACCESS_COOKIE)?.value, accessPassword()!);
    if (ok) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/access";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (mode !== "supabase") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/api");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
