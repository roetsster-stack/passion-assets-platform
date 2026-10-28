import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decide, type AssuranceLevel } from "@/lib/auth/decide";

/**
 * The guard on every route. Refreshes the session cookie, asks Supabase what the session has
 * proven, and lets `decide` say where the request may go. Nothing renders without sign-in.
 *
 * Unconfigured (no Supabase env, e.g. a preview with no variables yet) every request lands on
 * the sign-in screen, which then explains itself — never on data.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });

  let signedIn = false;
  let currentLevel: AssuranceLevel | null = null;
  let nextLevel: AssuranceLevel | null = null;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // getUser() validates the token with Supabase; getSession() would trust the cookie. Never the latter.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;

    if (user) {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      currentLevel = (data?.currentLevel as AssuranceLevel | null) ?? "aal1";
      nextLevel = (data?.nextLevel as AssuranceLevel | null) ?? "aal1";
    }
  }

  const decision = decide({ path, signedIn, currentLevel, nextLevel });
  if (decision.kind === "redirect") {
    const to = request.nextUrl.clone();
    to.pathname = decision.to;
    to.search = "";
    const redirect = NextResponse.redirect(to);
    // carry any refreshed cookies along
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // Everything except Next's own assets and the favicon. There are no public files to exclude:
  // the register has no public surface.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
