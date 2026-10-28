import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns the emailed link into a session. Accepts both of Supabase's link shapes — the default
 * (`?code=`) and the template form (`?token_hash=&type=`) — so switching the email template later
 * is a dashboard setting, not a code change. Then on to the second factor.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const fail = () => NextResponse.redirect(`${origin}/sign-in`);

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return fail();
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "magiclink" | "invite" | "recovery" });
    if (error) return fail();
  } else {
    return fail();
  }

  return NextResponse.redirect(`${origin}/mfa`);
}
