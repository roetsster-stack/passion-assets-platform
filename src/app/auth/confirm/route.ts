import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns the emailed link into a session. Accepts both of Supabase's link shapes — the default
 * (`?code=`) and the template form (`?token_hash=&type=`) — so switching the email template later
 * is a dashboard setting, not a code change. A link that carries its session in the fragment (an
 * invitation with the default template) is handed to /auth/session, which can see it. A link that
 * has been used or has expired says so, quietly, on the sign-in screen. Then on to the second factor.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const expired = () => NextResponse.redirect(`${origin}/sign-in?link=expired`);

  if (!code && !tokenHash) {
    // nothing the server can see: the session may be in the fragment
    return NextResponse.redirect(`${origin}/auth/session`);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn(`sign-in link: ${error.code ?? error.name}`);
      return expired();
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "magiclink" | "invite" | "recovery" });
    if (error) {
      console.warn(`sign-in link: ${error.code ?? error.name}`);
      return expired();
    }
  } else {
    return expired();
  }

  return NextResponse.redirect(`${origin}/mfa`);
}
