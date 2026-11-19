/**
 * M2-01 · The drafts as the owner's screen and the desk read them, in plain code. Of an artist's
 * drafts in a field, the newest is the one that counts: it waits (status "draft"), or it was
 * decided. What waits is shown; what was rejected, with its note, is answered by the next draft;
 * what was approved is the artist's text. Nothing here knows about the database.
 */
import type { Answer, Field } from "./types";

export type DraftStatus = "draft" | "approved" | "rejected";

/** The columns of a draft the screen and the desk read, as the database names them. */
export type DraftRow = {
  id: string;
  artist_id: string | null;
  field: Field;
  status: DraftStatus;
  created_at: string;
  decided_at: string | null;
  note: string | null;
};

const newest = <T extends { created_at: string }>(a: T, b: T) => (a.created_at >= b.created_at ? a : b);

/** By artist, then by field: the newest draft of each — the one that counts. */
export function latestPerField<T extends DraftRow>(rows: T[]): Map<string, Partial<Record<Field, T>>> {
  const out = new Map<string, Partial<Record<Field, T>>>();
  for (const r of rows) {
    if (!r.artist_id) continue;
    const fields = out.get(r.artist_id) ?? {};
    const cur = fields[r.field];
    fields[r.field] = cur ? newest(cur, r) : r;
    out.set(r.artist_id, fields);
  }
  return out;
}

export type Pending<T> = { artistId: string; fields: Partial<Record<Field, T>> };

/**
 * The artists with a draft that waits — in each field, only where the newest draft is the one
 * waiting — in the order of `artistOrder` (the register's: surname, given name); an artist the
 * order does not know comes last, by id.
 */
export function pending<T extends DraftRow>(rows: T[], artistOrder: string[]): Pending<T>[] {
  const rank = new Map(artistOrder.map((id, i) => [id, i]));
  const out: Pending<T>[] = [];
  for (const [artistId, latest] of latestPerField(rows)) {
    const fields: Partial<Record<Field, T>> = {};
    for (const field of ["why_they_matter", "biography"] as Field[]) {
      const d = latest[field];
      if (d && d.status === "draft") fields[field] = d;
    }
    if (Object.keys(fields).length) out.push({ artistId, fields });
  }
  return out.sort((a, b) => (rank.get(a.artistId) ?? Infinity) - (rank.get(b.artistId) ?? Infinity) || a.artistId.localeCompare(b.artistId));
}

/** How many artists have a draft that waits — the "n" of the wall's quiet "Drafts · n". */
export const pendingCount = <T extends DraftRow>(rows: T[]): number => pending(rows, []).length;

/**
 * For the desk: by field, the owner's note on the newest decided draft, where that draft was
 * rejected with a note — the next draft answers it. An approval, or a rejection without a note,
 * leaves nothing to answer; a draft that still waits is not a decision.
 */
export function answersFor(rows: DraftRow[]): Partial<Record<Field, Answer>> {
  const out: Partial<Record<Field, Answer>> = {};
  const decided = rows.filter((r) => r.status !== "draft" && r.decided_at);
  for (const field of ["biography", "why_they_matter"] as Field[]) {
    const last = decided.filter((r) => r.field === field).sort((a, b) => (a.decided_at! < b.decided_at! ? 1 : -1))[0];
    if (last && last.status === "rejected" && last.note && last.note.trim()) out[field] = { draftId: last.id, note: last.note.trim() };
  }
  return out;
}
