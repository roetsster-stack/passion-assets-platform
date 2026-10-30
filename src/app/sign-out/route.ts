import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sign out. A POST, so a link in an email cannot do it; the back button brings nothing back. */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // unconfigured: nothing to sign out of
  }
  const res = NextResponse.redirect(`${origin}/sign-in`, { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
