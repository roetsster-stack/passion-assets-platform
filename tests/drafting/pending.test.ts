/** M2-01 · Of an artist's drafts in a field, the newest counts: what waits is shown; a rejection's note is answered; an approval is the text. */
import { describe, expect, it } from "vitest";
import { answersFor, latestPerField, pending, pendingCount, type DraftRow } from "@/lib/drafting/pending";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const row = (o: Partial<DraftRow> & Pick<DraftRow, "id" | "artist_id" | "field" | "created_at">): DraftRow => ({ status: "draft", decided_at: null, note: null, ...o });

const rows: DraftRow[] = [
  // artist A: an old biography draft, then a newer one that waits; a why-they-matter rejected with a note
  row({ id: "a-bio-1", artist_id: A, field: "biography", created_at: "2026-11-17T10:00:00Z" }),
  row({ id: "a-bio-2", artist_id: A, field: "biography", created_at: "2026-11-19T10:00:00Z" }),
  row({ id: "a-why-1", artist_id: A, field: "why_they_matter", created_at: "2026-11-19T10:00:00Z", status: "rejected", decided_at: "2026-11-19T12:00:00Z", note: "too much about the films; say more about the prints" }),
  // artist B: both approved, then a newer biography that waits
  row({ id: "b-bio-1", artist_id: B, field: "biography", created_at: "2026-11-18T10:00:00Z", status: "approved", decided_at: "2026-11-18T12:00:00Z" }),
  row({ id: "b-why-1", artist_id: B, field: "why_they_matter", created_at: "2026-11-18T10:00:00Z", status: "approved", decided_at: "2026-11-18T12:00:00Z" }),
  row({ id: "b-bio-2", artist_id: B, field: "biography", created_at: "2026-11-19T10:00:00Z" }),
  // a draft about nobody
  row({ id: "none", artist_id: null, field: "biography", created_at: "2026-11-19T10:00:00Z" }),
];

describe("the newest draft of a field counts", () => {
  it("finds it by artist and field", () => {
    const latest = latestPerField(rows);
    expect(latest.get(A)?.biography?.id).toBe("a-bio-2");
    expect(latest.get(A)?.why_they_matter?.id).toBe("a-why-1");
    expect(latest.get(B)?.biography?.id).toBe("b-bio-2");
    expect(latest.get(B)?.why_they_matter?.id).toBe("b-why-1");
    expect(latest.has("null")).toBe(false);
  });

  it("lists what waits, by artist in the register's order, why they matter before the biography, and only the newest of a field", () => {
    const list = pending(rows, [B, A]);
    expect(list.map((p) => p.artistId)).toEqual([B, A]);
    expect(Object.keys(list[1].fields)).toEqual(["biography"]); // A's why they matter was rejected: nothing waits there
    expect(list[1].fields.biography?.id).toBe("a-bio-2");
    expect(list[0].fields).toEqual({ biography: rows[5] });
    // an artist the order does not know comes last
    expect(pending(rows, [A]).map((p) => p.artistId)).toEqual([A, B]);
    expect(pendingCount(rows)).toBe(2);
    // once decided, nothing waits
    expect(pending(rows.map((r) => ({ ...r, status: "approved" as const, decided_at: "2026-11-20T00:00:00Z" })), [])).toEqual([]);
  });

  it("for the desk: the note on the newest decided draft of a field, where it was rejected with one", () => {
    expect(answersFor(rows.filter((r) => r.artist_id === A))).toEqual({ why_they_matter: { draftId: "a-why-1", note: "too much about the films; say more about the prints" } });
    // an approval newer than the rejection leaves nothing to answer; a rejection with an empty note too
    const later = [...rows.filter((r) => r.artist_id === A), row({ id: "a-why-2", artist_id: A, field: "why_they_matter", created_at: "2026-11-20T10:00:00Z", status: "approved", decided_at: "2026-11-20T12:00:00Z" })];
    expect(answersFor(later)).toEqual({});
    expect(answersFor([row({ id: "x", artist_id: A, field: "biography", created_at: "2026-11-19T10:00:00Z", status: "rejected", decided_at: "2026-11-19T12:00:00Z", note: "  " })])).toEqual({});
    // a draft that still waits is not a decision
    expect(answersFor([row({ id: "y", artist_id: A, field: "biography", created_at: "2026-11-19T10:00:00Z", note: "stray" })])).toEqual({});
  });
});
