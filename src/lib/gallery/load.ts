import { createClient } from "@/lib/supabase/server";
import { PICTURE_COLUMNS, toWork, WORK_COLUMNS, type PictureRow, type WorkRow } from "./read";
import type { Work } from "./types";

/**
 * The gallery's reads, as the signed-in person: row-level security decides what exists. A
 * non-member, a half-signed-in session or an unconfigured preview all simply see nothing.
 * Works withdrawn from Airtable stay in the register but do not hang.
 */

export async function loadWorks(): Promise<Work[]> {
  try {
    const supabase = await createClient();
    const [works, pictures] = await Promise.all([
      supabase.from("items").select(WORK_COLUMNS).is("source_removed_at", null),
      supabase.from("gallery_pictures").select(PICTURE_COLUMNS),
    ]);
    if (works.error || !works.data) return [];
    // Without pictures the wall still hangs — every work as its label.
    const byItem = new Map(((pictures.data ?? []) as unknown as PictureRow[]).map((p) => [p.item_id, p]));
    return (works.data as unknown as WorkRow[]).map((w) => toWork(w, byItem.get(w.id) ?? null));
  } catch {
    return [];
  }
}

/** The provenance of one work, as entered, in the order of the links on its record. */
export async function loadProvenance(itemId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("provenance_events").select("label, sort_order").eq("item_id", itemId).order("sort_order");
    if (error || !data) return [];
    return data.map((p) => p.label as string).filter((l) => l.trim() !== "");
  } catch {
    return [];
  }
}
