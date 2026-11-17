/**
 * M2-04 · The rule checker, in plain code: money and the words of the market (2), rank (6), the
 * sensitive classes (5), invented voices (7), private lives (8), every sentence sourced (4), the
 * exact-match test on every quotation (7, and 6 as Michael wrote it), attribution (3), length (10).
 * A set of hand-written bad drafts, each with one planted fault, and the checker catches every one;
 * a set of good ones comes through clean.
 */
import { describe, expect, it } from "vitest";
import { attributes, checkField, checkSentence, namedIn, namesOf, normalise, quotationsIn, RANK_WORDS, VALUE_WORDS } from "@/lib/drafting/rules";
import { NOT_ENOUGH, type Sentence, type Source } from "@/lib/drafting/types";

const S: Source[] = [
  {
    n: 1,
    kind: "web",
    title: "Test Painter",
    publisher: "Harbour Gallery",
    link: "https://harbour-gallery.example/test-painter",
    passage: "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art. She lives and works in Cape Town. The gallery considers her one of the most important painters of her generation.",
  },
  {
    n: 2,
    kind: "supplied",
    title: "Notes for the register — Blue Field 2019",
    publisher: "Test Painter (the artist)",
    link: null,
    passage: "I painted *Blue Field* over one winter in a cold studio. The blue is the blue of the bay in July, which I wanted to keep.",
  },
  {
    n: 3,
    kind: "web",
    title: "Test Painter at the museum",
    publisher: "Iziko Museums of South Africa",
    link: "https://iziko.example/test-painter",
    passage: "Her work *Harbour at Dusk* entered the museum's collection in 2022.",
  },
  {
    n: 4,
    kind: "web",
    title: "Test Painter: a reading",
    publisher: "Tate",
    link: "https://tate.example/test-painter",
    passage: "Writer and critic Ann Example has written that Test Painter is interested in the harbour, not as a view but as a place of work. Test Painter told the museum: I paint what I remember.",
  },
];
const about = { living: true, artistNames: ["Painter", "Test"] };
const living = { living: true };
const s = (text: string, sources: number[] = [1]): Sentence => ({ text, sources });
const rulesOf = (text: string, sources: number[] = [1], ctx = living) => checkSentence(s(text, sources), S, ctx).map((v) => v.rule);

describe("rule 2 — never state or imply a value", () => {
  it("catches money in any currency, large numbers, and the words of the market", () => {
    for (const t of ["Her paintings sell for R2 million.", "One sold for $1,200.", "A work made £500.", "Prices are in ZAR.", "It fetched two million rand.", "She has made 1.2 million works.", "It changed hands for a few thousand dollars.", "A gift of 500 euros."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    for (const t of ["Her work is a sound investment.", "Her auction record was set in 2021.", "The market for her work is strong.", "She is a sought-after painter.", "A blue-chip name.", "The work is worth seeing."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    // a currency word with no amount beside it is a thing, not a value: a dollar bill in a collage
    expect(rulesOf("Halter makes a crudely formed US dollar bill from Sontag's text.")).toEqual([]);
    expect(rulesOf("The pound coin in the corner is a found object.")).toEqual([]);
    expect(VALUE_WORDS).toContain("sought-after");
    expect(VALUE_WORDS).toContain("appreciating");
  });
});

describe("rule 6 — no rank, no superlatives of our own", () => {
  it("catches the list's words and their kin", () => {
    for (const t of ["She is one of the most important painters of her generation.", "A celebrated painter.", "A major figure in Cape Town.", "Her seminal series.", "A leading painter.", "She is the most prolific of them.", "An influential teacher."]) {
      expect(rulesOf(t), t).toContain(6);
    }
    expect(RANK_WORDS).toContain("seminal");
    expect(RANK_WORDS).toContain("leading");
  });

  it("lets a cited source's own words through — quoted exactly and attributed — and nothing less", () => {
    expect(rulesOf("Harbour Gallery considers her “one of the most important painters of her generation”.")).toEqual([]);
    // straight quotes and spacing aside
    expect(rulesOf('Harbour Gallery considers her "one of the  most important painters of her generation".')).toEqual([]);
    expect(rulesOf("Harbour Gallery calls her ‘one of the most important painters of her generation’.")).toEqual([]);
    // a paraphrase never carries a superlative
    expect(rulesOf("Harbour Gallery considers her among the most important painters of her generation.")).toContain(6);
    // a quotation that is not verbatim is not a quotation (7), and its words are then our own (6)
    const changed = rulesOf("Harbour Gallery considers her “one of the most important painters of our time”.");
    expect(changed).toContain(7);
    expect(changed).toContain(6);
    // verbatim but unattributed in the sentence (3); the words are then our own (6)
    const unnamed = rulesOf("She is “one of the most important painters of her generation”.");
    expect(unnamed).toContain(3);
    expect(unnamed).toContain(6);
    // verbatim in a source the sentence does not cite
    expect(rulesOf("Harbour Gallery considers her “one of the most important painters of her generation”.", [3])).toContain(7);
  });
});

describe("the exact-match test on every quotation (rule 7)", () => {
  it("normalises quotes, spacing, dashes and emphasis — nothing else", () => {
    expect(normalise("“Blue  Field” — ‘a’ *b*")).toBe("\"Blue Field\" - 'a' b");
    expect(normalise("Blue Field")).not.toBe(normalise("blue field"));
  });

  it("reads double quotes anywhere and single quotes only as quotation marks", () => {
    expect(quotationsIn("A “b c” and 'd e' and f's g.").map((q) => q.text)).toEqual(["b c", "d e"]);
    expect(quotationsIn("Harbour Gallery's note says she lives in Cape Town.")).toEqual([]);
  });

  it("matches the artist's words with the markdown of the supplied text set aside, and wants the speaker named", () => {
    expect(rulesOf("Test Painter wrote: “I painted Blue Field over one winter in a cold studio.”", [2])).toEqual([]);
    // the artist's own text may be named by the role its author line states
    expect(rulesOf("The colour, the artist says, is “the blue of the bay in July”.", [2])).toEqual([]);
    expect(rulesOf("The colour, she says, is “the blue of the bay in July”.", [2])).toContain(3);
    const unnamed = rulesOf("She wrote: “I painted Blue Field over one winter in a cold studio.”", [2]);
    expect(unnamed).toContain(3);
    expect(rulesOf("Test Painter wrote: “I painted Blue Field over one summer in a cold studio.”", [2])).toContain(7);
  });

  it("names a source by its publisher or a distinctive word of it", () => {
    expect(namesOf("Test Painter (the artist)")).toEqual(["Test Painter", "Test", "Painter", "the artist"]);
    expect(namesOf("Harbour Gallery")).toEqual(["Harbour Gallery", "Harbour"]);
    expect(namesOf("Iziko Museums of South Africa")).toEqual(["Iziko Museums of South Africa", "Iziko"]);
    expect(attributes("as Iziko records", S[2])).toBe(true);
    expect(attributes("as the South African museum records", S[2])).toBe(false);
    expect(attributes("as Harbour Gallery puts it", S[0])).toBe(true);
    expect(attributes("as the gallery puts it", S[0])).toBe(false);
  });

  it("or by the named person the passage itself quotes — never by the subject's own name, and 'the artist' only where the passage is theirs", () => {
    expect(namedIn(S[3].passage)).toEqual(["Ann Example", "Test Painter"]);
    // a critic quoted on a museum's page, named in the sentence
    expect(rulesOf("Ann Example has written that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toEqual([]);
    expect(rulesOf("Tate records that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toEqual([]);
    expect(rulesOf("A critic has written that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(3);
    // naming the subject is not naming the source
    expect(rulesOf("Test Painter is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(3);
    // the artist's words on another's page: 'the artist' names them, because the passage carries the artist's name
    expect(rulesOf("The artist says she paints “what I remember”.", [4], about)).toEqual([]);
    expect(rulesOf("The artist says she paints “what I remember”.", [4])).toContain(3);
    expect(rulesOf("She says she paints “what I remember”.", [4], about)).toContain(3);
  });
});

describe("rules 4, 5, 7, 8 and 10", () => {
  it("every sentence has a source that exists; the list's own sentence needs none", () => {
    expect(rulesOf("She was born in Durban in 1980.", [])).toContain(4);
    expect(rulesOf("She was born in Durban in 1980.", [9])).toContain(4);
    expect(rulesOf("She was born in Durban in 1980.", [1])).toEqual([]);
    expect(rulesOf(NOT_ENOUGH, [])).toEqual([]);
  });

  it("never touches the sensitive classes — nor the collection's owner, by name", () => {
    for (const t of ["The painting hangs in a private collection.", "It is insured for its full value.", "The work is in poor condition.", "It is owned by a family in Durban."]) {
      expect(rulesOf(t), t).toContain(5);
    }
    const never = { living: true, neverName: ["Sample Owner", "Owner"] };
    expect(rulesOf("She painted it for Sample Owner in 2019.", [1], never)).toContain(5);
    expect(rulesOf("The owner of the gallery spoke.", [1], never)).toContain(5);
    expect(rulesOf("She lives in Cape Town.", [1], never)).toEqual([]);
  });

  it("no invented voices: the first person is never the desk's", () => {
    expect(rulesOf("I painted it in a cold studio.", [2])).toContain(7);
    expect(rulesOf("We see here a painter at work.")).toContain(7);
    expect(rulesOf("The US flag appears in one work.")).not.toContain(7);
  });

  it("private lives stay private — for the living", () => {
    expect(rulesOf("She was recently divorced.")).toContain(8);
    expect(rulesOf("She was recently divorced.", [1], { living: false })).not.toContain(8);
    expect(rulesOf("Test Painter has written that “The blue is the blue of the bay in July, which I wanted to keep.”", [2])).toEqual([]);
    // capitals count: a quotation keeps the passage's case
    expect(rulesOf("Test Painter has written that “the blue is the blue of the bay in July”.", [2])).toContain(7);
  });

  it("when unsure, write less: one sentence of thirty words, a biography of 120", () => {
    const long = "word ".repeat(31).trim() + ".";
    const r = checkField("why_they_matter", [s("Harbour Gallery calls her a painter of light."), s("She lives in Cape Town.")], S, living);
    expect(r.kept.map((x) => x.text)).toEqual(["Harbour Gallery calls her a painter of light."]);
    expect(r.removed).toEqual([{ text: "She lives in Cape Town.", rule: "length", why: "why they matter is one sentence" }]);
    expect(checkField("why_they_matter", [s(long)], S, living).removed[0].rule).toBe("length");
    const thirty = s("w ".repeat(29).trim() + " end.");
    const bio = checkField("biography", [thirty, thirty, thirty, thirty, thirty], S, living);
    expect(bio.kept).toHaveLength(4);
    expect(bio.removed[0].why).toBe("over 120 words");
  });
});

describe("the planted faults — every one caught; the good drafts clean", () => {
  const bad: { text: string; sources?: number[]; rule: number }[] = [
    { text: "Her paintings sell for R2 million.", rule: 2 },
    { text: "Her work is a sound investment.", rule: 2 },
    { text: "Her auction record was set in 2021.", rule: 2 },
    { text: "She is one of the most important painters of her generation.", rule: 6 },
    { text: "A celebrated painter of the harbour.", rule: 6 },
    { text: "Harbour Gallery considers her “one of the most important painters of our time”.", rule: 7 },
    { text: "She is “one of the most important painters of her generation”.", rule: 3 },
    { text: "She was born in Durban in 1980.", sources: [], rule: 4 },
    { text: "She studied at the Michaelis School of Fine Art.", sources: [9], rule: 4 },
    { text: "The painting hangs in the collector's dining room.", sources: [3], rule: 5 },
    { text: "I painted it in a cold studio.", sources: [2], rule: 7 },
    { text: "She wrote: “I painted Blue Field over one winter in a cold studio.”", sources: [2], rule: 3 },
    { text: "She was recently divorced.", rule: 8 },
    { text: "Her work has been exhibited at the Tate and sold for a record sum.", rule: 2 },
  ];
  it.each(bad)("catches: $text", ({ text, sources, rule }) => {
    expect(rulesOf(text, sources ?? [1])).toContain(rule);
  });

  const good: { text: string; sources: number[] }[] = [
    { text: "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art.", sources: [1] },
    { text: "She lives and works in Cape Town.", sources: [1] },
    { text: "*Harbour at Dusk* entered the collection of the Iziko Museums of South Africa in 2022.", sources: [3] },
    { text: "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”", sources: [2] },
    { text: "Harbour Gallery describes her as “one of the most important painters of her generation”.", sources: [1] },
    { text: "Most of her works are on paper.", sources: [1] },
    { text: NOT_ENOUGH, sources: [] },
  ];
  it.each(good)("passes: $text", ({ text, sources }) => {
    expect(rulesOf(text, sources)).toEqual([]);
  });

  it("a whole good biography comes through whole, and a whole bad one does not", () => {
    const biography = checkField("biography", good.slice(0, 5).map((g) => s(g.text, g.sources)), S, living);
    expect(biography.removed).toEqual([]);
    expect(biography.kept).toHaveLength(5);
    const faults = checkField("biography", bad.map((b) => s(b.text, b.sources ?? [1])), S, living);
    expect(faults.kept).toEqual([]);
    expect(faults.removed.map((r) => r.rule)).toEqual(bad.map((b) => b.rule));
  });
});
