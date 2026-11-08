import { NextResponse } from "next/server";
import { isImageId } from "@/lib/images/door";
import { parseTile, TILE_URL_SECONDS } from "@/lib/images/pyramid";
import { signObject } from "@/lib/images/sign";
import { decideTile, type TileSetRow } from "@/lib/images/tile-door";
import { createClient } from "@/lib/supabase/server";

/**
 * The tile door: `/t/<set>/<level>/<x>_<y>`. A zoom session asks for hundreds of tiles, so this
 * route is outside the middleware (see `src/middleware.ts`): there is no auth round-trip to
 * Supabase per tile. The row alone decides — it is read as the person asking, with the session
 * their cookie carries, and row-level security returns it only to a member who has proven both
 * factors. Then a redirect to a signed R2 address that dies in thirty minutes. The bytes never pass
 * through this function and the bucket is never public. Everything else is 404, indistinguishably.
 */

export const dynamic = "force-dynamic";

function notFound() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

let signingFailureLogged = false;
function logSigningFailure(err: unknown) {
  if (signingFailureLogged) return;
  signingFailureLogged = true;
  console.error("tile door: signing failed —", err instanceof Error ? err.message : String(err));
}

export async function GET(_request: Request, { params }: { params: Promise<{ set: string; tile: string[] }> }) {
  const { set, tile } = await params;
  // Nothing that is not an address reaches the database.
  if (!isImageId(set) || !parseTile(tile)) return notFound();

  let row: TileSetRow | null = null;
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    signedIn = !!session;
    if (signedIn) {
      const { data } = await supabase
        .from("images")
        .select("kind, storage_bucket, storage_key, width, height, tile_size, tile_overlap, levels")
        .eq("id", set)
        .maybeSingle();
      row = (data as TileSetRow | null) ?? null;
    }
  } catch {
    return notFound();
  }

  const decision = decideTile({ signedIn, row, tile });
  if (decision.kind === "not-found") return notFound();

  let url: string;
  try {
    url = await signObject(decision.bucket, decision.key, "image/jpeg", TILE_URL_SECONDS);
  } catch (err) {
    logSigningFailure(err);
    return notFound();
  }
  // The redirect may be reused by this browser only, and only while the address behind it lives.
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": `private, max-age=${TILE_URL_SECONDS - 60}` },
  });
}
