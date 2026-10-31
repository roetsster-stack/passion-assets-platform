import { NextResponse } from "next/server";
import { decideImage, isImageId, SIGNED_URL_SECONDS, type ImageDoorRow } from "@/lib/images/door";
import { signImage } from "@/lib/images/sign";
import { createClient } from "@/lib/supabase/server";

/**
 * The image door. The middleware has already refused anyone not fully signed in; here the image
 * row is read as the person asking, so row-level security decides whether it exists for them.
 * Then a redirect to a signed R2 address that dies in five minutes. The bytes never pass through
 * this function and the bucket is never public. Everything else is 404, indistinguishably.
 */

export const dynamic = "force-dynamic";

function notFound() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isImageId(id)) return notFound();

  let row: ImageDoorRow | null = null;
  let signedIn = false;
  try {
    const supabase = await createClient();
    // The cookie's session is enough to know someone is there: the database verifies the token
    // itself on the query below, and the middleware has already validated it with Supabase.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    signedIn = !!session;
    if (signedIn) {
      const { data } = await supabase.from("images").select("storage_bucket, storage_key, kind, content_type").eq("id", id).maybeSingle();
      row = (data as ImageDoorRow | null) ?? null;
    }
  } catch {
    return notFound();
  }

  const decision = decideImage({ signedIn, row });
  if (decision.kind === "not-found") return notFound();

  let url: string;
  try {
    url = await signImage(decision.bucket, decision.key, decision.contentType);
  } catch {
    return notFound();
  }
  // The redirect may be reused by this browser only, and only while the address behind it lives.
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": `private, max-age=${SIGNED_URL_SECONDS - 60}` },
  });
}
