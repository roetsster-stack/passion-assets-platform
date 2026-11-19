/**
 * M2-01 · What the Drafts screen reads, as the signed-in person. The drafts table is the owner's
 * alone, with both factors (row-level security), so a viewer — or the owner half-signed-in — reads
 * nothing here and the screen is not there for them. Who the person is comes from the members
 * table, which members may read.
 */
import { pendingCount, type DraftRow } from "@/lib/drafting/pending";
import type { Flag, Removal, Sentence, Source } from "@/lib/drafting/types";
import { createClient } from "@/lib/supabase/server";

export type DraftFull = DraftRow & {
  text: string;
  sentences: Sentence[];
  sources: Source[];
  removed: Removal[];
  flagged: Flag[];
  list_version: string;
  model: string;
  /** The rejected draft this one answers, if any. */
  answers: string | null;
};

export type ArtistName = { id: string; display_name: string };

export type DraftsRead = {
  rows: DraftFull[];
  /** The register's artists in its order (surname, given name): the order the screen walks. */
  artists: ArtistName[];
};

export const DRAFT_COLUMNS = "id, artist_id, field, status, created_at, decided_at, note, text, sentences, sources, removed, flagged, list_version, model, answers";

/** The owner's drafts about artists, and the artists, as the signed-in person; null when nothing can be read. */
export async function loadDrafts(): Promise<DraftsRead | null> {
  try {
    const supabase = await createClient();
    const [drafts, artists] = await Promise.all([
      supabase.from("drafts").select(DRAFT_COLUMNS).eq("subject", "artist"),
      supabase.from("artists").select("id, display_name").order("surname").order("given_name"),
    ]);
    if (drafts.error || !drafts.data || artists.error || !artists.data) return null;
    return { rows: drafts.data as unknown as DraftFull[], artists: artists.data as ArtistName[] };
  } catch {
    return null;
  }
}

/** The signed-in person's role in their collection, from the members table: "owner", "advisor", "viewer" — or null. */
export async function myRole(): Promise<"owner" | "advisor" | "viewer" | null> {
  try {
    const supabase = await createClient();
    const { data: who } = await supabase.auth.getUser();
    if (!who.user) return null;
    const { data, error } = await supabase.from("collection_members").select("role").eq("user_id", who.user.id).limit(1);
    if (error || !data || !data[0]) return null;
    const role = data[0].role;
    return role === "owner" || role === "advisor" || role === "viewer" ? role : null;
  } catch {
    return null;
  }
}

/** How many artists have a draft waiting — for the owner; zero for anyone the table shows nothing to. */
export async function loadPendingCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("drafts").select("id, artist_id, field, status, created_at, decided_at, note").eq("subject", "artist");
    if (error || !data) return 0;
    return pendingCount(data as unknown as DraftRow[]);
  } catch {
    return 0;
  }
}
