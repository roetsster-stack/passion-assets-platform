/** M2-01 · Of an artist's drafts in a field, the newest counts: what waits is shown; a rejection's note is answered; an approval is the text. */
import { describe, expect, it } from "vitest";
import { answersFor, fieldsToDraft, latestPerField, onlyFields, pending, pendingCount, wantsDraft, type DraftRow } from "@/lib/drafting/pending";
import type { Draft } from "@/lib/drafting/types";

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

  it("for --all: a field is drafted when it has no draft or its newest draft was sent back; waiting and approved fields are left", () => {
    const latest = latestPerField(rows);
    // A: the biography waits, the why they matter was sent back — only the why they matter
    expect(fieldsToDraft(latest.get(A))).toEqual(["why_they_matter"]);
    expect(wantsDraft(latest.get(A))).toBe(true);
    // B: the why they matter stands approved, a newer biography waits — nothing
    expect(fieldsToDraft(latest.get(B))).toEqual([]);
    expect(wantsDraft(latest.get(B))).toBe(false);
    // no draft yet: both
    expect(fieldsToDraft(undefined)).toEqual(["biography", "why_they_matter"]);
    expect(wantsDraft(undefined)).toBe(true);
    // both approved: nothing
    const approved = latestPerField(rows.filter((r) => r.id === "b-bio-1" || r.id === "b-why-1"));
    expect(fieldsToDraft(approved.get(B))).toEqual([]);
    expect(wantsDraft(approved.get(B))).toBe(false);
    // the review's case: why they matter approved, the biography sent back with a note — the biography alone
    const sentBack = latestPerField([rows[4], { ...rows[5], status: "rejected", decided_at: "2026-11-20T00:00:00Z", note: "say more about the prints" }]);
    expect(fieldsToDraft(sentBack.get(B))).toEqual(["biography"]);
    // a field sent back and then drafted again: the newer draft waits, so it is left for the owner to read
    const answered = latestPerField([rows[2], row({ id: "a-why-2", artist_id: A, field: "why_they_matter", created_at: "2026-11-20T10:00:00Z" })]);
    expect(fieldsToDraft(answered.get(A))).toEqual(["biography"]); // only the biography, which has no draft in this set
    // one field drafted and waiting, the other never drafted: the other alone
    expect(fieldsToDraft(latestPerField([rows[1]]).get(A))).toEqual(["why_they_matter"]);
  });

  it("for --all, the catch of 19 Nov: a register where every draft waits is drafted by nobody", () => {
    // the live table after the first --all: 33 artists, two waiting drafts each
    const waiting: DraftRow[] = [];
    for (let i = 0; i < 33; i++) {
      const id = `00000000-0000-4000-8000-0000000000${(i + 10).toString(16)}`;
      waiting.push(row({ id: `${id}-bio`, artist_id: id, field: "biography", created_at: "2026-11-19T07:00:00Z" }));
      waiting.push(row({ id: `${id}-why`, artist_id: id, field: "why_they_matter", created_at: "2026-11-19T07:00:00Z" }));
    }
    const latest = latestPerField(waiting);
    expect(latest.size).toBe(33);
    expect([...latest.keys()].filter((id) => wantsDraft(latest.get(id)))).toEqual([]);
    // send one biography back: that artist, that field, and no other
    const [first] = waiting;
    const sentBack = latestPerField(waiting.map((r) => (r.id === first.id ? { ...r, status: "rejected" as const, decided_at: "2026-11-19T12:00:00Z", note: "shorter" } : r)));
    expect([...sentBack.keys()].filter((id) => wantsDraft(sentBack.get(id)))).toEqual([first.artist_id]);
    expect(fieldsToDraft(sentBack.get(first.artist_id!))).toEqual(["biography"]);
  });

  it("keeps only the wanted fields of what the desk wrote, with the sources they cite and the notes they answer", () => {
    const source = (n: number) => ({ n, kind: "web" as const, title: `Page ${n}`, publisher: "Stevenson", link: `https://example.org/${n}`, passage: `passage ${n}` });
    const draft: Draft = {
      artist: { id: A, displayName: "Ann Painter", surname: "Painter", givenName: "Ann", nationality: ["South African"], birthYear: 1970, deathYear: null, works: [] },
      listVersion: "1", model: "test", usage: { requests: 1, inputTokens: 10, outputTokens: 5, webSearches: 0 }, notes: ["a note of the run"],
      sources: [source(1), source(2), source(3)],
      fields: [
        { field: "biography", text: "Born in 1970. She paints.", sentences: [{ text: "Born in 1970.", sources: [1] }, { text: "She paints.", sources: [1, 2] }], removed: [], flagged: [] },
        { field: "why_they_matter", text: "She matters.", sentences: [{ text: "She matters.", sources: [3] }], removed: [], flagged: [] },
      ],
      answers: { biography: { draftId: "a-bio-1", note: "shorter" }, why_they_matter: { draftId: "a-why-1", note: "the prints" } },
    };
    const bio = onlyFields(draft, ["biography"]);
    expect(bio.fields.map((f) => f.field)).toEqual(["biography"]);
    expect(bio.sources.map((s) => s.n)).toEqual([1, 2]); // source 3 was cited by the why they matter alone
    expect(bio.answers).toEqual({ biography: { draftId: "a-bio-1", note: "shorter" } });
    expect(bio.usage).toEqual(draft.usage); // the call cost what it cost
    expect(bio.notes).toEqual(draft.notes);
    // both wanted: unchanged
    expect(onlyFields(draft, ["biography", "why_they_matter"])).toEqual(draft);
    // nothing wanted: nothing
    expect(onlyFields(draft, []).fields).toEqual([]);
    expect(onlyFields(draft, []).sources).toEqual([]);
    // a draft that answered nothing stays so
    expect(onlyFields({ ...draft, answers: undefined }, ["biography"]).answers).toBeUndefined();
    expect(draft.fields).toHaveLength(2); // the input is not changed
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
