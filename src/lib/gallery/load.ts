import { createClient } from "@/lib/supabase/server";
import { toWork, WORK_COLUMNS, type WorkRow } from "./read";
import type { Work } from "./types";

/**
 * The gallery's reads, as the signed-in person: row-level security decides what exists. A
 * non-member, a half-signed-in session or an unconfigured preview all simply see nothing.
 * Works withdrawn from Airtable stay in the register but do not hang.
 */

export async function loadWorks(): Promise<Work[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("items").select(WORK_COLUMNS).is("source_removed_at", null);
    if (error || !data) return [];
    return (data as unknown as WorkRow[]).map(toWork);
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
