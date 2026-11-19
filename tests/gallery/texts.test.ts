/** M2-01 · An artist's approved texts beside the work: their shape held, their sources combined and dated, the title in italics. */
import { describe, expect, it } from "vitest";
import { NOT_ENOUGH } from "@/lib/drafting/types";
import { citedSources, combine, commonTitle, dayOf, pageKey, publisherOf, readOn, safeLink, segments, sourceLabel, toApprovedText, toArtistTexts, type ApprovedText } from "@/lib/gallery/texts";

const bioRow = {
  id: "00000000-0000-4000-8000-0000000000d1",
  artist_id: "00000000-0000-4000-8000-0000000000a1",
  field: "biography",
  text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art. She paints the harbour.",
  sentences: [
    { text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", sources: [1] },
    { text: "She paints the harbour.", sources: [2, 1] },
  ],
  sources: [
    { n: 1, kind: "web", title: "Test Painter", publisher: "Harbour Gallery", link: "https://harbour-gallery.example/p", passage: "Born in Durban in 1980.", readAt: "2026-11-19T07:30:00.000Z" },
    { n: 2, kind: "supplied", title: "Notes", publisher: "Test Painter", link: null, passage: "I paint the harbour." },
    { n: 3, kind: "web", title: "Never cited", publisher: "Tate", link: "javascript:alert(1)", passage: "x" },
  ],
  decided_at: "2026-11-19T12:00:00Z",
  created_at: "2026-11-19T07:31:00Z",
};
const whyRow = {
  ...bioRow,
  id: "00000000-0000-4000-8000-0000000000d2",
  field: "why_they_matter",
  text: "Of *Blue Field*, Test Painter has written that the blue is “the blue of the bay in July”.",
  sentences: [{ text: "Of *Blue Field*, Test Painter has written that the blue is “the blue of the bay in July”.", sources: [1] }],
  sources: [{ n: 1, kind: "supplied", title: "Notes", publisher: "Test Painter", link: null, passage: "I paint the harbour." }],
  created_at: "2026-11-18T07:31:00Z",
};

describe("the approved texts", () => {
  it("hold their shape, or are nothing — and a link a browser may follow is http(s) only", () => {
    const t = toApprovedText(bioRow)!;
    expect(t.field).toBe("biography");
    expect(t.sentences).toHaveLength(2);
    expect(t.sources[2].link).toBeNull();
    expect(toApprovedText({ ...bioRow, sentences: [{ text: 1 }] })).toBeNull();
    expect(toApprovedText({ ...bioRow, sources: [{ n: "1" }] })).toBeNull();
    expect(toApprovedText({ ...bioRow, field: "tombstone" })).toBeNull();
    expect(toApprovedText({ ...bioRow, text: "  " })).toBeNull();
    expect(toApprovedText(null)).toBeNull();
    // the list's own sentence is an answer, not a text: never shown beside a work (the review of PR #14)
    expect(toApprovedText({ ...bioRow, text: NOT_ENOUGH, sentences: [{ text: NOT_ENOUGH, sources: [] }] })).toBeNull();
    expect(toApprovedText({ ...bioRow, text: `  ${NOT_ENOUGH} ` })).toBeNull();
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("https://harbour-gallery.example/p")).toBe("https://harbour-gallery.example/p");
    expect(safeLink(null)).toBeNull();
    const both = toArtistTexts([bioRow, whyRow, { junk: true }]);
    expect(both.biography?.id).toBe(bioRow.id);
    expect(both.whyTheyMatter?.id).toBe(whyRow.id);
    expect(toArtistTexts([])).toEqual({ whyTheyMatter: null, biography: null });
  });

  it("list only the sources the sentences cite, in number order", () => {
    expect(citedSources(toApprovedText(bioRow)!).map((s) => s.n)).toEqual([1, 2]);
  });

  it("date each source with the day the desk read it — its own, or failing that the draft's", () => {
    expect(dayOf("2026-11-19T07:30:00.000Z")).toBe("19 Nov 2026");
    expect(dayOf("not a date")).toBeNull();
    const t = toApprovedText(bioRow)!;
    expect(readOn(t.sources[0], t.createdAt)).toBe("read 19 Nov 2026");
    expect(readOn(t.sources[1], t.createdAt)).toBe("read 19 Nov 2026");
    expect(readOn({ readAt: undefined }, "2026-11-18T23:59:00Z")).toBe("read 18 Nov 2026");
  });

  it("name who stands behind a source without the desk's own marker: the artist's own words, or the publisher (the review of PR #14)", () => {
    expect(publisherOf({ kind: "supplied", publisher: "Test Painter (the artist)" })).toBe("the artist's own words");
    expect(publisherOf({ kind: "supplied", publisher: "Test Painter (The Artist) " })).toBe("the artist's own words");
    expect(publisherOf({ kind: "supplied", publisher: "Ann Example" })).toBe("Ann Example");
    expect(publisherOf({ kind: "web", publisher: "Tate" })).toBe("Tate");
    expect(sourceLabel({ kind: "supplied", title: "Test Painter — in her own words", publisher: "Test Painter (the artist)" })).toBe("Test Painter — in her own words");
    expect(sourceLabel({ kind: "supplied", title: "Notes for the register", publisher: "Test Painter (the artist)" })).toBe("Notes for the register, the artist's own words");
    expect(sourceLabel({ kind: "supplied", title: "A catalogue note", publisher: "Ann Example" })).toBe("A catalogue note, Ann Example");
    expect(sourceLabel({ kind: "web", title: "Test Painter", publisher: "Harbour Gallery" })).toBe("Test Painter, Harbour Gallery");
    for (const s of [bioRow, whyRow].flatMap((r) => r.sources)) expect(sourceLabel(s as never)).not.toContain("(the artist)");
  });

  it("count a page once, however many passages were quoted from it — the Sources line is a Literature line, not a list of paragraphs (the review of PR #14)", () => {
    const page = { kind: "web" as const, publisher: "Stevenson", link: "https://stevenson.example/halter" };
    const t: ApprovedText = {
      id: "t",
      field: "biography",
      text: "x",
      sentences: [
        { text: "First.", sources: [1] },
        { text: "Second.", sources: [2, 3] },
        { text: "Third.", sources: [3, 4] },
      ],
      sources: [
        { n: 1, ...page, title: "Dan Halter", passage: "p1" },
        { n: 2, ...page, title: "Dan Halter", passage: "p2" },
        { n: 3, ...page, title: "Dan Halter", passage: "p3" },
        { n: 4, kind: "supplied", title: "Dan Halter — in his own words — On the flag", publisher: "Dan Halter (the artist)", link: null, passage: "s1" },
        { n: 5, kind: "supplied", title: "Dan Halter — in his own words", publisher: "Dan Halter (the artist)", link: null, passage: "s2" },
        { n: 6, kind: "supplied", title: "Dan Halter — in his own words — On weaving", publisher: "Dan Halter (the artist)", link: null, passage: "s3" },
      ],
      decidedAt: "2026-11-19T12:00:00Z",
      createdAt: "2026-11-19T07:31:00Z",
    };
    const { sources, shown } = combine([t, { ...t, id: "u", field: "why_they_matter", sentences: [{ text: "Why.", sources: [6, 2] }] }]);
    expect(sources.map((s) => [s.n, sourceLabel(s)])).toEqual([
      [1, "Dan Halter, Stevenson"],
      [2, "Dan Halter — in his own words"],
    ]);
    expect(shown[0].sentences.map((s) => s.sources)).toEqual([[1], [1], [1, 2]]);
    expect(shown[1].sentences.map((s) => s.sources)).toEqual([[1, 2]]);
    // the page's name from its passages' titles
    expect(commonTitle(["X — in his own words — On the flag", "X — in his own words", "X — in his own words — On weaving"])).toBe("X — in his own words");
    expect(commonTitle(["X — in his own words — On the flag", "X — in his own words — On weaving"])).toBe("X — in his own words");
    expect(commonTitle(["X — in his own words — On the flag"])).toBe("X — in his own words — On the flag");
    expect(commonTitle(["Alpha — a", "Beta — b"])).toBe("Beta — b"); // nothing in common: the shorter
    expect(pageKey({ kind: "web", link: null, title: "T", publisher: "P" })).toBe("web|T|P");
    expect(pageKey({ kind: "supplied", link: null, title: "T — heading", publisher: "A (the artist)" })).toBe("supplied|A (the artist)");
  });

  it("combine two texts' sources into one Sources line, each source once, numbered as first cited, the sentences renumbered to match", () => {
    const why = toApprovedText(whyRow) as ApprovedText;
    const bio = toApprovedText(bioRow) as ApprovedText;
    const { sources, shown } = combine([why, bio]);
    // why they matter cites the supplied notes first → 1; the biography's gallery page → 2; its notes are the same source → 1 again
    expect(sources.map((s) => [s.n, s.title])).toEqual([
      [1, "Notes"],
      [2, "Test Painter"],
    ]);
    expect(shown.find((s) => s.field === "why_they_matter")?.sentences[0].sources).toEqual([1]);
    expect(shown.find((s) => s.field === "biography")?.sentences.map((s) => s.sources)).toEqual([[2], [1, 2]]);
    // a source with no read date of its own takes its draft's
    expect(sources[0].readAt).toBe("2026-11-18T07:31:00Z");
    expect(sources[1].readAt).toBe("2026-11-19T07:30:00.000Z");
    // the uncited third source is not on the line; a sentence citing a number that does not exist cites nothing
    expect(combine([{ ...bio, sentences: [{ text: "x", sources: [9] }] }]).sources).toEqual([]);
    expect(combine([])).toEqual({ sources: [], shown: [] });
  });

  it("split a sentence into segments, the title in italics", () => {
    expect(segments("Of *Blue Field*, she has written that the blue is “the blue of the bay”.")).toEqual([
      { text: "Of ", italic: false },
      { text: "Blue Field", italic: true },
      { text: ", she has written that the blue is “the blue of the bay”.", italic: false },
    ]);
    expect(segments("No title here.")).toEqual([{ text: "No title here.", italic: false }]);
    expect(segments("*Harbour at Dusk* and *Blue Field*")).toEqual([
      { text: "Harbour at Dusk", italic: true },
      { text: " and ", italic: false },
      { text: "Blue Field", italic: true },
    ]);
  });
});
