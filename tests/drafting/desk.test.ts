/**
 * M2-04 · The desk, against a stand-in model: supplied texts first, then the search on the
 * allowlist only; a sentence on no source or on a source that does not exist is dropped; the rule
 * checker and the second reading remove and flag; "Not enough is known yet." stands on nothing;
 * every draft carries the list's version and the model's name; the input holds nothing sensitive.
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
          { text: "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art.", sources: [3] },
          { text: "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”", sources: [1] },
          { text: "She exhibited in Paris in 2015.", sources: [] },
          { text: "She studied in London.", sources: [9] },
          { text: "Her work is a sound investment.", sources: [3] },
          { text: "She lives in Cape Town.", sources: [3] },
          { text: "She paints the harbour.", sources: [2] },
          { text: "She painted a portrait of Sample Roets.", sources: [3] },
        ],
        whyTheyMatter: [{ text: "Harbour Gallery considers her “one of the most important painters of her generation”.", sources: [3] }, { text: "A second sentence.", sources: [3] }],
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
      "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art.",
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
    expect(why.sentences).toHaveLength(1);
    expect(why.removed).toEqual([{ text: "A second sentence.", rule: "length", why: "why they matter is one sentence" }]);
    // only the sources the kept sentences cite travel with the draft
    expect(draft.sources.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(draft.usage.requests).toBe(1 + 1 + 2);
    expect(draft.usage.webSearches).toBe(2);
    // the second reading saw only what the rules had already let through
    expect(calls.read[0].sentences.map((s) => s.text)).not.toContain("Her work is a sound investment.");
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
