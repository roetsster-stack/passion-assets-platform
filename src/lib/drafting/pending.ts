/**
 * M2-01 · The drafts as the owner's screen and the desk read them, in plain code. Of an artist's
 * drafts in a field, the newest is the one that counts: it waits (status "draft"), or it was
 * decided. What waits is shown; what was rejected, with its note, is answered by the next draft;
 * what was approved is the artist's text. Nothing here knows about the database.
 */
import { FIELDS, type Answer, type Draft, type Field } from "./types";

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

/**
 * For `--all`, by field: a field is drafted when it has no draft yet, or when its newest draft was sent
 * back — the next draft answers the note. A field whose newest draft waits is left for the owner to
 * read, and an approved one stands. (The review of PR #14, should-fix 4, and its check of round two:
 * the first fix drafted every field not yet approved, so a second `--all` would have drafted all 33
 * again beside the drafts not yet read.)
 */
export function fieldsToDraft(latest: Partial<Record<Field, Pick<DraftRow, "status">>> | undefined): Field[] {
  return FIELDS.filter((f) => {
    const status = latest?.[f]?.status;
    return status === undefined || status === "rejected";
  });
}

/** For `--all`: an artist is drafted when some field of theirs is. */
export const wantsDraft = (latest: Partial<Record<Field, Pick<DraftRow, "status">>> | undefined): boolean => fieldsToDraft(latest).length > 0;

/**
 * Of a draft the desk wrote, only these fields, with the sources they cite and the notes they answer.
 * The desk writes both texts in one call; under `--all`, only the fields that want a draft reach the
 * table and the report — a waiting or approved field is not drafted over.
 */
export function onlyFields(draft: Draft, fields: Field[]): Draft {
  const kept = draft.fields.filter((f) => fields.includes(f.field));
  const cited = new Set(kept.flatMap((f) => f.sentences.flatMap((s) => s.sources)));
  const answers = draft.answers && Object.fromEntries(Object.entries(draft.answers).filter(([f]) => fields.includes(f as Field)));
  return { ...draft, fields: kept, sources: draft.sources.filter((s) => cited.has(s.n)), answers };
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
