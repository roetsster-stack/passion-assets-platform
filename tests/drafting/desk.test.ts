/**
 * M2-04 · The desk, against a stand-in model: supplied texts first, then the search on the
 * allowlist only; a sentence on no source or on a source that does not exist is dropped; the rule
 * checker and the second reading remove and flag; a biography over 250 words after the reading is
 * sent back once to be shortened, keeping its four moves, and checked and read again — only what
 * is still over is cut (18 Nov); the lengths come after the reading, a sentence the cut removes is
 * not "flagged (kept)", and a field left empty says "Not enough is known yet." (M2-04b); a sentence
 * with no verdict is doubted; every draft carries the list's version and the model's name; the
 * input holds nothing sensitive.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { draftArtist, dropUncited, number } from "@/lib/drafting/desk";
import { ARTIST_COLUMNS, describeArtist, toArtistInput, WORK_COLUMNS, type ArtistRow } from "@/lib/drafting/input";
import { loadList } from "@/lib/drafting/list";
import { suppliedSources } from "@/lib/drafting/sources";
import { NOT_ENOUGH, type ArtistInput, type Source } from "@/lib/drafting/types";
import { standIn } from "./stand-in";

const root = path.resolve(__dirname, "..", "..");
const list = loadList(path.join(root, "docs", "drafting", "prohibition-list.md"));
const CONTEXT = path.join(__dirname, "fixtures", "context");
const sites = [{ domain: "harbour-gallery.example", name: "Harbour Gallery" }];

const painter: ArtistInput = {
  id: "00000000-0000-4000-8000-0000000000a1",
  displayName: "Test Painter",
  surname: "Painter",
  givenName: "Test",
  nationality: ["South Africa"],
  birthYear: 1980,
  deathYear: null,
  works: [{ title: "Blue Field", year: "2019", medium: "Painting" }],
};
const found: Omit<Source, "n">[] = [
  {
    kind: "web",
    title: "Test Painter",
    publisher: "Harbour Gallery",
    link: "https://harbour-gallery.example/test-painter",
    passage: "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art. The gallery considers her one of the most important painters of her generation.",
  },
];
const supplied = (a: ArtistInput) => suppliedSources(CONTEXT, a);

describe("the desk", () => {
  it("numbers the supplied texts before the web, searches the allowlist only, and drafts under the list", async () => {
    const { model, calls } = standIn({
      found,
      model: "claude-test-5",
      answer: {
        biography: [
          { text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", sources: [3] },
          { text: "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”", sources: [1] },
          { text: "She exhibited in Paris in 2015.", sources: [] },
          { text: "She studied in London.", sources: [9] },
          { text: "Her work is a sound investment.", sources: [3] },
          { text: "She lives in Cape Town.", sources: [3] },
          { text: "She paints the harbour.", sources: [2] },
          { text: "She painted a portrait of Sample Roets.", sources: [3] },
        ],
        whyTheyMatter: [
          { text: "Harbour Gallery considers her “one of the most important painters of her generation”.", sources: [3] },
          { text: "A second sentence.", sources: [3] },
          { text: "A third sentence.", sources: [3] },
        ],
      },
      verdicts: (req) =>
        req.sentences.map((s, i) => ({
          index: i + 1,
          verdict: s.text === "She lives in Cape Town." ? "remove" : s.text === "She paints the harbour." ? "flag" : "keep",
          rule: s.text === "She lives in Cape Town." ? 4 : null,
          why: s.text === "She lives in Cape Town." ? "the cited passage does not say so" : "doubtful",
        })),
    });

    const draft = await draftArtist(painter, { model, list, sites, supplied, neverName: ["Sample Roets"] });

    expect(calls.search[0].sites).toEqual(sites);
    const sources = calls.draft[0].sources;
    expect(sources.map((s) => [s.n, s.kind])).toEqual([
      [1, "supplied"],
      [2, "supplied"],
      [3, "web"],
    ]);
    expect(calls.draft[0].list.version).toBe(list.version);
    expect(draft.listVersion).toBe(list.version);
    expect(draft.model).toBe("claude-test-5");

    const bio = draft.fields.find((f) => f.field === "biography")!;
    expect(bio.sentences.map((s) => s.text)).toEqual([
      "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.",
      "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”",
      "She paints the harbour.",
    ]);
    expect(bio.text).toBe(bio.sentences.map((s) => s.text).join(" "));
    expect(bio.removed).toEqual([
      { text: "She exhibited in Paris in 2015.", rule: "uncited", why: "rests on no source" },
      { text: "She studied in London.", rule: "uncited", why: "cites a source that does not exist (9)" },
      { text: "Her work is a sound investment.", rule: 2, why: "rule 2: a word of the market (“investment”)" },
      { text: "She painted a portrait of Sample Roets.", rule: 5, why: "rule 5: names the collection or its owner (“Sample Roets”)" },
      { text: "She lives in Cape Town.", rule: "reading", why: "the second reading (rule 4): the cited passage does not say so" },
    ]);
    expect(bio.flagged).toEqual([{ text: "She paints the harbour.", why: "doubtful" }]);

    const why = draft.fields.find((f) => f.field === "why_they_matter")!;
    expect(why.sentences).toHaveLength(2);
    expect(why.removed).toEqual([{ text: "A third sentence.", rule: "length", why: "why they matter is at most two sentences" }]);
    // only the sources the kept sentences cite travel with the draft
    expect(draft.sources.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(draft.usage.requests).toBe(1 + 1 + 2);
    expect(draft.usage.webSearches).toBe(2);
    // the second reading saw only what the rules had already let through
    expect(calls.read[0].sentences.map((s) => s.text)).not.toContain("Her work is a sound investment.");
    // nothing ran long: nothing was sent back to be shortened
    expect(calls.shorten).toHaveLength(0);
  });

  it("with nothing to write from, asks the model nothing and answers with the list's own sentence", async () => {
    const { model, calls } = standIn({ found: [] });
    const draft = await draftArtist({ ...painter, surname: "Nobody" }, { model, list, sites, supplied });
    expect(calls.draft).toHaveLength(0);
    expect(draft.fields.map((f) => f.text)).toEqual([NOT_ENOUGH, NOT_ENOUGH]);
    expect(draft.notes).toEqual(["no supplied text", "the search found nothing on the allowed sites", "no sources at all — nothing was asked of the model"]);
    expect(draft.listVersion).toBe(list.version);
    expect(draft.model).toBe("stand-in");
  });

  it("with no sites, searches nothing and drafts from the supplied text alone; the list's sentence needs no source", async () => {
    const { model, calls } = standIn({
      answer: { biography: [{ text: "She paints.", sources: [1] }, { text: NOT_ENOUGH, sources: [] }], whyTheyMatter: [{ text: NOT_ENOUGH, sources: [] }] },
    });
    const draft = await draftArtist(painter, { model, list, sites: [], supplied });
    expect(calls.search).toHaveLength(0);
    expect(draft.notes).toEqual(["no sites to search"]);
    expect(draft.fields[0].text).toBe(`She paints. ${NOT_ENOUGH}`);
    expect(draft.fields[1].text).toBe(NOT_ENOUGH);
    expect(draft.fields.flatMap((f) => f.removed)).toEqual([]);
  });

  it("reads before it cuts — a sentence the reading removes makes room for one that fits — and a field emptied says so in the list's words", async () => {
    const long = "Harbour Gallery " + "word ".repeat(53).trim() + ".";
    const { model, calls } = standIn({
      found,
      answer: {
        biography: [{ text: "She lives in Cape Town.", sources: [3] }],
        whyTheyMatter: [
          { text: "Harbour Gallery calls her a painter of light.", sources: [3] },
          { text: long, sources: [3] },
          { text: "She shows in Cape Town.", sources: [3] },
        ],
      },
      verdicts: (req) =>
        req.field === "biography"
          ? [{ index: 1, verdict: "remove", rule: 4, why: "the passage does not say so" }]
          : req.sentences.map((s, i) => ({ index: i + 1, verdict: s.text === long ? "remove" : "keep", rule: s.text === long ? 4 : null, why: "" })),
    });
    const draft = await draftArtist(painter, { model, list, sites, supplied });
    const why = draft.fields.find((f) => f.field === "why_they_matter")!;
    // the reading saw all three; under M2-04 the third would have been cut for length before anyone read it
    expect(calls.read.find((r) => r.field === "why_they_matter")!.sentences).toHaveLength(3);
    expect(why.sentences.map((s) => s.text)).toEqual(["Harbour Gallery calls her a painter of light.", "She shows in Cape Town."]);
    expect(why.removed.map((r) => r.rule)).toEqual(["reading"]);
    // why they matter is cut, never sent back to be shortened
    expect(calls.shorten).toHaveLength(0);
    const bio = draft.fields.find((f) => f.field === "biography")!;
    expect(bio.sentences).toEqual([{ text: NOT_ENOUGH, sources: [] }]);
    expect(bio.text).toBe(NOT_ENOUGH);
    expect(bio.removed).toHaveLength(1);
    expect(draft.notes).toContain("biography: nothing survived the checks — the list's own sentence stands");
  });

  it("a sentence the reading gives no verdict on is flagged, never passed", async () => {
    const { model } = standIn({ found, answer: { biography: [{ text: "She lives in Cape Town.", sources: [3] }], whyTheyMatter: [] }, verdicts: () => [] });
    const draft = await draftArtist(painter, { model, list, sites, supplied });
    const bio = draft.fields.find((f) => f.field === "biography")!;
    expect(bio.sentences.map((s) => s.text)).toEqual(["She lives in Cape Town."]);
    expect(bio.flagged).toEqual([{ text: "She lives in Cape Town.", why: "the second reading gave no verdict" }]);
    expect(draft.fields.find((f) => f.field === "why_they_matter")!.text).toBe(NOT_ENOUGH);
  });

  // six sentences of fifty words: a biography of 300, over the limit after the reading
  const fifty = (n: number) => ({ text: `Sentence ${n} ` + "word ".repeat(47).trim() + " end.", sources: [3] });
  const long = [1, 2, 3, 4, 5, 6].map(fifty);
  const wordsIn = (texts: string[]) => texts.join(" ").split(/\s+/).filter(Boolean).length;

  it("a biography over 250 words after the reading is sent back once to be shortened, keeping its four moves, and the shortened text is checked and read again", async () => {
    const shortened = [
      { text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", sources: [3] },
      { text: "Her work is a sound investment.", sources: [3] },
      { text: "She lives in Cape Town.", sources: [3] },
      { text: "She paints the harbour.", sources: [3] },
    ];
    const { model, calls } = standIn({
      found,
      answer: { biography: long, whyTheyMatter: [{ text: NOT_ENOUGH, sources: [] }] },
      shortened: () => shortened,
      verdicts: (req) => req.sentences.map((s, i) => ({ index: i + 1, verdict: s.text === "She lives in Cape Town." ? "remove" : "keep", rule: s.text === "She lives in Cape Town." ? 4 : null, why: "not in the passage" })),
    });
    const draft = await draftArtist(painter, { model, list, sites, supplied });
    const bio = draft.fields.find((f) => f.field === "biography")!;
    // asked once, with what the reading had kept, the limit and the sources
    expect(calls.shorten).toHaveLength(1);
    expect(calls.shorten[0].field).toBe("biography");
    expect(calls.shorten[0].limit).toBe(250);
    expect(calls.shorten[0].sentences).toEqual(long);
    expect(calls.shorten[0].sources.map((s) => s.n)).toEqual([1, 2, 3]);
    // the shortened text went through the rules and the reading again
    const readings = calls.read.filter((r) => r.field === "biography");
    expect(readings).toHaveLength(2);
    expect(readings[1].sentences.map((s) => s.text)).toEqual(["Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", "She lives in Cape Town.", "She paints the harbour."]);
    expect(bio.sentences.map((s) => s.text)).toEqual(["Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", "She paints the harbour."]);
    // the longer version is kept whole, as one "shortened" entry, ahead of what the re-check removed (19 Nov)
    expect(bio.removed).toEqual([
      {
        text: long.map((s) => s.text).join(" "),
        rule: "shortened",
        why: `shortened by the model from ${wordsIn(long.map((s) => s.text))} to ${wordsIn(bio.sentences.map((s) => s.text))} words — this is the longer version, as it stood before`,
      },
      { text: "Her work is a sound investment.", rule: 2, why: "rule 2: a word of the market (“investment”)" },
      { text: "She lives in Cape Town.", rule: "reading", why: "the second reading (rule 4): not in the passage" },
    ]);
    expect(draft.notes).toContain(`biography: ${wordsIn(long.map((s) => s.text))} words after the reading, over 250 — the model shortened it once, to ${wordsIn(bio.sentences.map((s) => s.text))}`);
    // search, draft, two readings of the biography, the shortening, one reading of why they matter
    expect(draft.usage.requests).toBe(1 + 1 + 2 + 1 + 1);
  });

  it("what is still over after the one shortening is cut from the end — and a sentence the cut removes is not 'flagged (kept)'", async () => {
    const { model, calls } = standIn({
      found,
      answer: { biography: long, whyTheyMatter: [{ text: NOT_ENOUGH, sources: [] }] },
      verdicts: (req) => req.sentences.map((s, i) => ({ index: i + 1, verdict: s.text.startsWith("Sentence 6") ? "flag" : "keep", rule: null, why: "doubtful" })),
    });
    const draft = await draftArtist(painter, { model, list, sites, supplied });
    const bio = draft.fields.find((f) => f.field === "biography")!;
    expect(calls.shorten).toHaveLength(1);
    expect(bio.sentences.map((s) => s.text)).toEqual(long.slice(0, 5).map((s) => s.text));
    expect(bio.removed).toEqual([
      { text: long.map((s) => s.text).join(" "), rule: "shortened", why: "shortened by the model from 300 to 300 words — this is the longer version, as it stood before" },
      { text: long[5].text, rule: "length", why: "over 250 words" },
    ]);
    expect(bio.flagged).toEqual([]);
    expect(draft.notes).toContain("biography: 300 words after the reading, over 250 — the model shortened it once, to 300, still over: cut from the end");
  });

  it("a model that cannot shorten does not fail the draft: the biography is cut from the end, and the note says so", async () => {
    const { model } = standIn({ found, answer: { biography: long, whyTheyMatter: [{ text: NOT_ENOUGH, sources: [] }] }, shortened: "decline" });
    const draft = await draftArtist(painter, { model, list, sites, supplied });
    const bio = draft.fields.find((f) => f.field === "biography")!;
    expect(bio.sentences).toHaveLength(5);
    expect(draft.notes).toContain("biography: 300 words after the reading, over 250 — the model could not shorten it (the model declined to shorten the draft); cut from the end instead");
    // nothing was shortened, so no "shortened" entry
    expect(bio.removed.map((r) => r.rule)).toEqual(["length"]);
  });

  it("every source carries the date the desk read it (M2-01: shown to every reader as “read 19 Nov 2026”)", async () => {
    const { model } = standIn({ found, answer: { biography: [{ text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", sources: [1, 3] }], whyTheyMatter: [] } });
    const now = () => new Date("2026-11-19T07:30:00Z");
    const draft = await draftArtist(painter, { model, list, sites, supplied }, { now });
    expect(draft.sources.length).toBeGreaterThan(0);
    for (const s of draft.sources) expect(s.readAt).toBe("2026-11-19T07:30:00.000Z");
    // and with nothing to write from, the (empty) list of sources is still the desk's
    const { model: dry } = standIn({ found: [] });
    const nothing = await draftArtist({ ...painter, surname: "Nobody", givenName: "No", displayName: "No Nobody" }, { model: dry, list, sites, supplied }, { now });
    expect(nothing.sources).toEqual([]);
  });

  it("the owner's note on a rejected draft goes to the model, by field, and is recorded on the draft that answers it (M2-01)", async () => {
    const { model, calls } = standIn({ found, answer: { biography: [{ text: "She paints the harbour.", sources: [3] }], whyTheyMatter: [{ text: NOT_ENOUGH, sources: [] }] } });
    const answers = { biography: { draftId: "00000000-0000-4000-8000-0000000000d1", note: "too much about the films; say more about the prints" } };
    const draft = await draftArtist(painter, { model, list, sites, supplied }, { answers });
    expect(calls.draft).toHaveLength(1);
    expect(calls.draft[0].notes).toEqual({ biography: "too much about the films; say more about the prints" });
    expect(draft.answers).toEqual(answers);
    // no note, nothing sent and nothing recorded
    const { model: plain, calls: plainCalls } = standIn({ found, answer: { biography: [], whyTheyMatter: [] } });
    const bare = await draftArtist(painter, { model: plain, list, sites, supplied });
    expect(plainCalls.draft[0].notes).toBeUndefined();
    expect(bare.answers).toBeUndefined();
  });

  it("drops a sentence on no source or on a source that does not exist, before any rule", () => {
    const sources = number([found[0]]);
    const r = dropUncited([{ text: "A.", sources: [1] }, { text: "B.", sources: [] }, { text: "C.", sources: [1, 2] }, { text: NOT_ENOUGH, sources: [7] }], sources);
    expect(r.kept).toEqual([{ text: "A.", sources: [1] }, { text: NOT_ENOUGH, sources: [] }]);
    expect(r.removed.map((x) => x.text)).toEqual(["B.", "C."]);
  });
});

describe("the minimal input — never a value, a price, a location, an owner, a note", () => {
  const SENSITIVE = ["location", "location_tags", "purchase_price", "purchase_currency", "purchase_price_zar", "current_value", "current_value_currency", "valuation_date", "valuation_source", "acquired_from", "acquired_on", "credit_gallery", "condition_note", "admin_notes", "collectors_story", "comments_raw", "notes_raw", "airtable_raw", "links", "has_invoice", "has_coa"];

  it("selects only the artist's name, dates and nationality, and each work's title, year and medium", () => {
    expect([...ARTIST_COLUMNS]).toEqual(["id", "display_name", "surname", "given_name", "nationality", "birth_year", "death_year"]);
    expect([...WORK_COLUMNS]).toEqual(["artist_id", "title", "year_text", "year", "medium"]);
    for (const c of SENSITIVE) {
      expect(ARTIST_COLUMNS as readonly string[], c).not.toContain(c);
      expect(WORK_COLUMNS as readonly string[], c).not.toContain(c);
    }
  });

  it("leaves behind anything else a row carries, and the prompt says only what is left", () => {
    const row = { id: "x", display_name: "Test Painter", surname: "Painter", given_name: "Test", nationality: ["South Africa"], birth_year: 1980, death_year: null, location: "The study, Storeroom B", purchase_price: 12000 } as ArtistRow & Record<string, unknown>;
    const works = [{ title: "Blue Field", year_text: "2019", year: 2019, medium: "Painting", location: "Storeroom B", purchase_price: 12000, acquired_from: "Someone Private" }];
    const input = toArtistInput(row, works);
    expect(Object.keys(input).sort()).toEqual(["birthYear", "deathYear", "displayName", "givenName", "id", "nationality", "surname", "works"]);
    expect(Object.keys(input.works[0]).sort()).toEqual(["medium", "title", "year"]);
    const prompt = describeArtist(input);
    expect(prompt).toBe("Artist: Test Painter (b. 1980); South Africa\nWorks in this collection (title, year, medium):\n  - *Blue Field*, 2019 — Painting");
    for (const never of ["Storeroom", "12000", "Someone Private"]) expect(prompt).not.toContain(never);
    expect(toArtistInput({ ...row, death_year: 2020 }, [{ title: null, year_text: null, year: null, medium: null }]).works).toEqual([{ title: null, year: null, medium: null }]);
    expect(describeArtist({ ...input, deathYear: 2020, works: [] })).toContain("(1980–2020)");
    expect(describeArtist({ ...input, deathYear: 2020, works: [] })).toContain("(none recorded)");
  });
});
