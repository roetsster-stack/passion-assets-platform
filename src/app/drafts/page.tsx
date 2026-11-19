import { notFound, redirect } from "next/navigation";
import { pending } from "@/lib/drafting/pending";
import { loadDrafts, myRole } from "@/lib/drafts/load";
import { Quiet } from "./Quiet";

/**
 * M2-01 · Drafts: the owner's door, and nobody else's. The address itself is the way in — and the
 * quiet word at the end of the wall. One artist at a time: this page finds the first artist with a
 * draft waiting and goes there. A viewer, an advisor or a stranger finds nothing at this address,
 * exactly as at any other wrong one: the database shows them no draft and the members table says
 * they are not the owner.
 */

export const dynamic = "force-dynamic";

export default async function Drafts() {
  const [role, read] = await Promise.all([myRole(), loadDrafts()]);
  if (role !== "owner" || !read) notFound();
  const waiting = pending(
    read.rows,
    read.artists.map((a) => a.id),
  );
  if (waiting.length === 0) return <Quiet title="Nothing waits." line="Every draft has been decided. The desk writes the next on Workshop." />;
  redirect(`/drafts/${waiting[0].artistId}`);
}
