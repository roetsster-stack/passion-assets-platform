import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decide, type AssuranceLevel } from "@/lib/auth/decide";
import { contentSecurityPolicy, newNonce, renditionsHost } from "@/lib/security/csp";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * The guard on every route. Refreshes the session cookie, asks Supabase what the session has
 * proven, and lets `decide` say where the request may go. Nothing renders without sign-in.
 *
 * Unconfigured (no Supabase env, e.g. a preview with no variables yet) every request lands on
 * the sign-in screen, which then explains itself — never on data.
 *
 * It also sets the Content-Security-Policy (SEC-01) on every response it answers, with a nonce
 * made fresh for that response. The policy travels on the forwarded request as well: Next reads
 * the nonce there and marks its own inline scripts with it, and a page can read it as `x-nonce`.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const nonce = newNonce();
  const csp = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
    production: process.env.NODE_ENV === "production",
    supabaseUrl: url,
    renditionsHost: renditionsHost(process.env),
  });
  // The request as it stands now (its cookies may have been refreshed), with the policy and the nonce on it.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  let signedIn = false;
  let currentLevel: AssuranceLevel | null = null;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) => request.cookies.set(name, value));
          response = forward();
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) => response.cookies.set(name, value, options));
        },
      },
    });

    // getUser() validates the token with Supabase; getSession() would trust the cookie. Never the latter
    // here. (The image door reads getSession() only as a short-circuit after this guard has run; the
    // database verifies the same token on its query, so the row, not the cookie, decides.)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;

    if (user) {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      currentLevel = (data?.currentLevel as AssuranceLevel | null) ?? "aal1";
    }
  }

  const decision = decide({ path, signedIn, currentLevel });
  if (decision.kind === "redirect") {
    const to = request.nextUrl.clone();
    to.pathname = decision.to;
    to.search = "";
    const redirect = NextResponse.redirect(to);
    // carry any refreshed cookies along
    for (const c of response.cookies.getAll()) redirect.cookies.set(c.name, c.value, c);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except Next's own assets, the favicon — and the tile door. A zoom session asks for
  // hundreds of tiles; a validation round-trip to Supabase for each would make the glass stutter.
  // The tile door relies on the database alone: the tile row is read as the person asking, with the
  // session their cookie carries, and row-level security returns it only to a member who has proven
  // both factors. Without that, 404 — an image request wants no redirect to the sign-in screen anyway.
  // What the door does give up is revocation: it trusts the cookie's token until that token expires,
  // so a session signed out elsewhere can still fetch tiles for up to an hour. Membership and the
  // second factor are still proven on every tile.
  // The exemption is the door's own shape — a tile-set id and a tile beneath it — and not the whole
  // `/t/` prefix, so anything else ever placed there goes through this guard like every other route.
  // There are no public files to exclude: the register has no public surface.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|t/[0-9a-f-]{36}/).*)"],
};
