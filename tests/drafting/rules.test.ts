/**
 * M2-04 · The rule checker, in plain code — made strict in M2-04b after the cold reviews of PR #11
 * and PR #12: money and the market's facts (2) and the sensitive classes (5) nowhere, quoted or
 * not; the words of the market (2) and rank (6) only inside an attributed quotation; a living
 * person's private life (8) only in the artist's own words, given to the artist — the artist by
 * their own name, the speaker from the same sentence of the passage; invented voices (7), among
 * them a quotation given to the wrong speaker and ten words of a source in a row outside quotation
 * marks; every sentence sourced (4); the exact-match test on every quotation, whole words only (7,
 * and 6 as Michael wrote it); attribution by a distinctive name as written, by a speaker the
 * passage shows, or by the artist for their own words — never by a place, a common word or phrase,
 * a first name or the subject's name (3); the lengths as real sentences (10). A set of hand-written
 * bad drafts, each with one planted fault — the reviews' bypasses among them — and the checker
 * catches every one; a set of good ones comes through clean.
 */
import { describe, expect, it } from "vitest";
import {
  artistsOwn, attributes, attribution, checkField, checkSentence, type Context, italicsIn, liftedRun, LIFT_WORDS, MARKET_FACTS, namesOf, normalise,
  placeOf, PRIVATE_WORDS, quotationsIn, RANK_WORDS, sentenceCount, speakersIn, trimToLength, VALUE_WORDS,
} from "@/lib/drafting/rules";
import { NOT_ENOUGH, type Sentence, type Source } from "@/lib/drafting/types";

const S: Source[] = [
  {
    n: 1,
    kind: "web",
    title: "Test Painter",
    publisher: "Harbour Gallery",
    link: "https://harbour-gallery.example/test-painter",
    passage:
      "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art. She lives and works in Cape Town. The gallery considers her one of the most important painters of her generation, and *Blue Field* the artist's finest work.",
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
  {
    n: 5,
    kind: "web",
    title: "Test Painter",
    publisher: "Everard Read",
    link: "https://everard-read.example/test-painter",
    passage: "Living in Cape Town, she is the most significant artist of her generation, a view the Turner Prize jury shared. Her early work she now calls unimportant.",
  },
  {
    n: 6,
    kind: "web",
    title: "Test Painter in conversation",
    publisher: "ART AFRICA",
    link: "https://artafrica.example/test-painter",
    passage:
      "In an interview with ART AFRICA, Test Painter spoke of her long illness and her divorce, and of her father, a trial lawyer: I paint what I remember of him. The critic Sam Sample has written that her father's house appears in every work.",
  },
  {
    n: 7,
    kind: "web",
    title: "Market report",
    publisher: "The Art Newspaper",
    link: "https://theartnewspaper.example/report",
    passage: "The work sold for £1.2m at Christie's in 2021 and is now in the private collection of a Johannesburg banker.",
  },
  {
    n: 8,
    kind: "web",
    title: "Test Painter",
    publisher: "Zeitz MOCAA (Zeitz Museum of Contemporary Art Africa)",
    link: "https://zeitzmocaa.example/test-painter",
    passage: "Test Painter is celebrated internationally for her prints and paintings.",
  },
];
const about: Context = { living: true, artist: { surname: "Painter", givenName: "Test", displayName: "Test Painter" } };
const living: Context = { living: true };
const s = (text: string, sources: number[] = [1]): Sentence => ({ text, sources });
const rulesOf = (text: string, sources: number[] = [1], ctx: Context = living) => checkSentence(s(text, sources), S, ctx).map((v) => v.rule);

describe("rule 2 — never state or imply a value", () => {
  it("catches money in any currency and phrasing, large numbers, and the words of the market", () => {
    for (const t of ["Her paintings sell for R2 million.", "One sold for $1,200.", "A work made £500.", "Prices are in ZAR.", "It fetched two million rand.", "She has made 1.2 million works.", "It changed hands for a few thousand dollars.", "A gift of 500 euros."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    // the phrasings the review found missing
    for (const t of ["A million-dollar painting.", "A multimillion-dollar work.", "It made millions of dollars.", "It brought tens of thousands of pounds.", "It went for 2.4m rand.", "It made 50k dollars.", "It cost thirty dollars.", "A seven-figure sum changed hands."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    for (const t of ["Her work is a sound investment.", "Her auction record was set in 2021.", "The market for her work is strong.", "She is a sought-after painter.", "A blue-chip name.", "The work is worth seeing.", "Her work rose sharply in value.", "A valuable and priceless thing.", "She is in demand.", "Collectors compete for her work.", "Her shows sell out."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    // a currency word with no amount beside it is a thing, not a value: a dollar bill in a collage; a measurement is not money
    expect(rulesOf("Halter makes a crudely formed US dollar bill from Sontag's text.")).toEqual([]);
    expect(rulesOf("The pound coin in the corner is a found object.")).toEqual([]);
    expect(rulesOf("The canvas is 2.4m wide.")).toEqual([]);
    expect(VALUE_WORDS).toContain("sought-after");
    expect(VALUE_WORDS).toContain("appreciating");
  });

  it("an auction house, a sale or a result is caught anywhere — in the desk's words or in a quotation", () => {
    for (const t of ["It sold at Christie's.", "The top lot at Sotheby's.", "It went under the hammer at Strauss & Co.", "Bonhams offered it in 2019.", "A sale followed in 2020.", "It was estimated to reach a record."]) {
      expect(rulesOf(t), t).toContain(2);
    }
    expect(MARKET_FACTS).toContain("sold at");
    expect(MARKET_FACTS).toContain("estimated to reach");
    // the review's bypass: a sum inside a correctly quoted and attributed passage
    expect(rulesOf("The Art Newspaper reported that the work “sold for £1.2m at Christie’s”.", [7])).toContain(2);
    expect(rulesOf("The Art Newspaper reported that the work “sold for £1.2m at Christie’s”.", [7])).not.toContain(3);
  });

  it("hyphens hide nothing: sell-out, sold-out, high-value (the review of PR #12, should-fix 2)", () => {
    for (const t of ["A sell-out show.", "The show was sold-out.", "A high-value work."]) expect(rulesOf(t), t).toContain(2);
  });

  it("Phillips is an auction house beside a word of the auction room, and a surname otherwise (the nit)", () => {
    expect(rulesOf("Lisa Phillips, the director, wrote the essay.")).toEqual([]);
    expect(rulesOf("Phillips auctioned it in 2020.")).toContain(2);
    expect(rulesOf("It was offered at Phillips in the evening sale.")).toContain(2);
    expect(MARKET_FACTS).not.toContain("phillips");
  });
});

describe("rule 6 — no rank, no superlatives of our own", () => {
  it("catches the list's words and their kin, and a possessive before 'most'", () => {
    for (const t of ["She is one of the most important painters of her generation.", "A celebrated painter.", "A major figure in Cape Town.", "Her seminal series.", "A leading painter.", "She is the most prolific of them.", "An influential teacher."]) {
      expect(rulesOf(t), t).toContain(6);
    }
    for (const t of ["Africa's most exciting painter.", "One of South Africa's most collected artists.", "Her most ambitious work to date.", "A well-known painter.", "An eminent figure.", "Lauded and hailed.", "A landmark show.", "A trailblazing career.", "She is highly regarded.", "An exceptional and remarkable eye."]) {
      expect(rulesOf(t), t).toContain(6);
    }
    // hyphenated praise (should-fix 2)
    for (const t of ["A world-famous painter.", "A much-lauded series.", "An internationally-acclaimed painter.", "She is highly-regarded."]) expect(rulesOf(t), t).toContain(6);
    // a quantity, a date, and what someone is known for are not a rank
    expect(rulesOf("Most of her works are on paper.")).toEqual([]);
    expect(rulesOf("Her most recent show was in Cape Town.")).toEqual([]);
    expect(rulesOf("She is best known for her prints.")).toEqual([]);
    expect(rulesOf("She is best-known for her prints.")).toEqual([]);
    expect(rulesOf("Her best work is on paper.")).toContain(6);
    expect(RANK_WORDS).toContain("seminal");
    expect(RANK_WORDS).toContain("well-known");
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

  it("reads double quotes anywhere and single quotes only as quotation marks — an apostrophe inside one is allowed", () => {
    expect(quotationsIn("A “b c” and 'd e' and f's g.").map((q) => q.text)).toEqual(["b c", "d e"]);
    expect(quotationsIn("Harbour Gallery's note says she lives in Cape Town.")).toEqual([]);
    expect(quotationsIn("Harbour Gallery calls it ‘the artist’s finest work’.").map((q) => q.text)).toEqual(["the artist’s finest work"]);
    expect(rulesOf("Harbour Gallery calls *Blue Field* ‘the artist’s finest work’.")).toEqual([]);
  });

  it("wants the words whole: a quotation begins and ends at a word boundary in the passage", () => {
    expect(placeOf("Her early work she now calls unimportant.", "important")).toBeNull();
    expect(placeOf("An important work.", "important")).toEqual({ text: "important", start: 3, end: 12 });
    const partial = rulesOf("Tate calls her early work “important”.", [5]);
    expect(partial).toContain(7);
    expect(rulesOf("Everard Read says she now calls her early work “unimportant”.", [5])).toEqual([]);
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
});

describe("lifted text (rule 7, as Michael set it on 18 Nov): ten words of a source in a row, outside quotation marks", () => {
  const lifted = "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art.";

  it("is caught — in any capitals, with any punctuation, from any source — and named by its length and source", () => {
    const v = checkSentence(s(lifted, [1]), S, living);
    expect(v.map((x) => x.rule)).toEqual([7]);
    expect(v[0].why).toBe("17 words of source [1] in a row without quotation marks — quote them, or rephrase");
    expect(rulesOf(lifted.toLowerCase())).toContain(7);
    expect(rulesOf("Test Painter was born in Durban in 1980, and studied at the Michaelis School of Fine Art; she paints.")).toContain(7);
    // lifted from a source the sentence does not cite
    expect(rulesOf(lifted, [3])).toContain(7);
    expect(liftedRun(lifted, [], S)).toEqual({ words: "test painter was born in durban in 1980 and studied at the michaelis school of fine art", n: 1 });
    expect(LIFT_WORDS).toBe(10);
  });

  it("is not: fewer than ten words in a row, a quotation, or a title in italics", () => {
    expect(rulesOf("Born in Durban in 1980, she studied at the Michaelis School of Fine Art in the city.")).toEqual([]);
    expect(rulesOf("Harbour Gallery records that she “was born in Durban in 1980 and studied at the Michaelis School of Fine Art”.")).toEqual([]);
    expect(rulesOf("Her show *Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art* opened in 2020.")).toEqual([]);
    expect(liftedRun("Born in Durban in 1980, she studied at the Michaelis School of Fine Art in the city.", [], S)).toBeNull();
  });
});

describe("attribution (rule 3) — who may be named as the source of quoted words", () => {
  it("the publisher: its whole name, a run of its words, a distinctive word, an acronym or a stated role — never a common word or phrase, never a first name", () => {
    expect(namesOf("Test Painter (the artist)")).toEqual(["Test Painter", "Painter", "the artist"]);
    expect(namesOf("Harbour Gallery")).toEqual(["Harbour Gallery", "Harbour"]);
    expect(namesOf("Everard Read")).toEqual(["Everard Read", "Everard"]);
    expect(namesOf("SA Print Gallery")).toEqual(["SA Print Gallery", "SA Print"]);
    expect(namesOf("blank projects")).toEqual(["blank projects"]);
    expect(namesOf("Smithsonian Institution")).toEqual(["Smithsonian Institution", "Smithsonian"]);
    expect(namesOf("South African History Online (SAHO)")).toEqual(["South African History Online", "SAHO"]);
    expect(namesOf("The Metropolitan Museum of Art (the Met)")).toEqual(["The Metropolitan Museum of Art", "the Met"]);
    expect(namesOf("Contemporary And (C&)")).toEqual(["Contemporary And", "C&"]);
    expect(namesOf("Victoria and Albert Museum (V&A)")).toEqual(["Victoria and Albert Museum", "V&A"]);
    const iziko = namesOf("Iziko Museums of South Africa");
    expect(iziko).toEqual(expect.arrayContaining(["Iziko", "Iziko Museums"]));
    expect(iziko).not.toContain("South Africa");
    expect(iziko).not.toContain("Museums of South Africa");
    // the review of PR #12, should-fix 1: a first name before a surname never names the gallery alone
    expect(namesOf("Jack Shainman Gallery")).toEqual(["Jack Shainman Gallery", "Jack Shainman", "Shainman Gallery", "Shainman"]);
    expect(namesOf("Marian Goodman Gallery")).not.toContain("Marian");
    const fakhoury = namesOf("Galerie Cécile Fakhoury");
    expect(fakhoury).toEqual(expect.arrayContaining(["Galerie Cécile Fakhoury", "Cécile Fakhoury", "Fakhoury"]));
    expect(fakhoury).not.toContain("Cécile");
    // the nit: a second name in parentheses with spaces counts whole, and by its own names
    const zeitz = namesOf("Zeitz MOCAA (Zeitz Museum of Contemporary Art Africa)");
    expect(zeitz).toEqual(expect.arrayContaining(["Zeitz MOCAA", "MOCAA", "Zeitz Museum of Contemporary Art Africa", "Zeitz Museum", "Zeitz"]));

    expect(attributes("as Iziko records", S[2])).toBe(true);
    expect(attributes("as the South African museum records", S[2])).toBe(false);
    expect(attributes("as Harbour Gallery puts it", S[0])).toBe(true);
    expect(attributes("as the gallery puts it", S[0])).toBe(false);
    expect(attributes("critics read her as", S[4])).toBe(false);
    expect(attributes("as Tate records", S[3])).toBe(true);
    expect(attributes("as the Zeitz Museum of Contemporary Art Africa records", S[7])).toBe(true);
    expect(attributes("as Zeitz records", S[7])).toBe(true);
  });

  it("a name is matched as written, capitals included — only its first letter may be either case", () => {
    expect(attributes("as Everard Read notes", S[4])).toBe(true);
    expect(attributes("as everard read notes", S[4])).toBe(false);
    expect(attributes("as tate records", S[3])).toBe(false);
    const blank: Source = { n: 9, kind: "web", title: "T", publisher: "blank projects", link: "https://blankprojects.example/", passage: "She paints." };
    expect(attributes("as blank projects notes", blank)).toBe(true);
    expect(attributes("Blank projects notes", blank)).toBe(true);
    expect(attributes("as BLANK PROJECTS notes", blank)).toBe(false);
    const met: Source = { n: 9, kind: "web", title: "T", publisher: "The Metropolitan Museum of Art (the Met)", link: "https://metmuseum.example/", passage: "She paints." };
    expect(attributes("as the Met records", met)).toBe(true);
    expect(attributes("The Met records", met)).toBe(true);
    expect(attributes("the metropolitan", met)).toBe(false);
    // the review's phrases, which named a source and no longer do
    const saho: Source = { n: 9, kind: "web", title: "T", publisher: "South African History Online (SAHO)", link: "https://sahistory.example/", passage: "He is the foremost artist of his time." };
    expect(checkSentence(s("Steeped in South African history, he is “the foremost artist of his time”.", [9]), [saho], living).map((v) => v.rule)).toContain(3);
    expect(checkSentence(s("SAHO calls him “the foremost artist of his time”.", [9]), [saho], living)).toEqual([]);
    expect(attributes("His contemporary and friend", { kind: "web", publisher: "Contemporary And (C&)", passage: "x" })).toBe(false);
    expect(attributes("as C& reports", { kind: "web", publisher: "Contemporary And (C&)", passage: "x" })).toBe(true);
    expect(attributes("Victoria and her sister", { kind: "web", publisher: "Victoria and Albert Museum (V&A)", passage: "x" })).toBe(false);
    expect(attributes("the Union Jack", { kind: "web", publisher: "Jack Shainman Gallery", passage: "x" })).toBe(false);
    expect(attributes("as Shainman Gallery notes", { kind: "web", publisher: "Jack Shainman Gallery", passage: "x" })).toBe(true);
  });

  it("a person the passage shows speaking: two or more words beside a speech verb — never a place, a prize or a bare mention", () => {
    expect(speakersIn(S[3].passage)).toEqual(["Ann Example", "Test Painter"]);
    expect(speakersIn(S[4].passage)).toEqual([]);
    expect(speakersIn("According to Hilton Als, the work is quiet.")).toEqual(["Hilton Als"]);
    expect(speakersIn("The work is, in Hilton Als's words, quiet.")).toEqual(["Hilton Als"]);
    expect(speakersIn("The Turner Prize jury wrote that it was quiet.")).toEqual([]);
    expect(speakersIn("Als writes that it is quiet.")).toEqual([]);
    expect(speakersIn("Hilton Als, writing in the catalogue, observes that it is quiet.")).toEqual(["Hilton Als"]);
    // the journalist's form, the verb first after the quotation
    expect(speakersIn("“It is quiet,” says Hilton Als.")).toEqual(["Hilton Als"]);
    // a critic quoted on a museum's page, named in the sentence
    expect(rulesOf("Ann Example has written that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toEqual([]);
    expect(rulesOf("Tate records that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toEqual([]);
    expect(rulesOf("A critic has written that she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(3);
    // the review's bypasses: a place name in the passage, a common word of the publisher's name
    expect(rulesOf("Living in Cape Town, she is “the most significant artist” of her generation.", [5])).toContain(3);
    expect(rulesOf("Critics read her as “the most significant artist” of her generation.", [5])).toContain(3);
    expect(rulesOf("Everard Read calls her “the most significant artist” of her generation.", [5])).toEqual([]);
  });

  it("'the artist' and the artist's name count only for the artist's own words — never for a critic's, and never as mere subject", () => {
    // the artist's words on another's page, where the passage shows the artist speaking them
    expect(rulesOf("The artist says she paints “what I remember”.", [4], about)).toEqual([]);
    expect(rulesOf("Test Painter says she paints “what I remember”.", [4], about)).toEqual([]);
    expect(rulesOf("The artist says she paints “what I remember”.", [4])).not.toEqual([]);
    expect(rulesOf("She says she paints “what I remember”.", [4], about)).toContain(3);
    // the critic's line put in the artist's mouth: the wrong speaker (rule 7), the page named or not
    expect(rulesOf("The artist says she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(7);
    expect(rulesOf("In Tate, the artist says she is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(7);
    // naming the subject is not naming the source
    expect(rulesOf("Test Painter is “interested in the harbour, not as a view but as a place of work”.", [4], about)).toContain(3);
    // a page about the artist with no speech in it is not the artist speaking
    expect(rulesOf("The artist is, in her own account, “celebrated internationally for her prints and paintings”.", [8], about)).toContain(3);
    expect(rulesOf("Zeitz MOCAA calls her “celebrated internationally for her prints and paintings”.", [8], about)).toEqual([]);

    expect(artistsOwn(S[1], null, about)).toBe(true);
    expect(artistsOwn(S[3], "what I remember", about)).toBe(true);
    expect(artistsOwn(S[3], "interested in the harbour, not as a view but as a place of work", about)).toBe(false);
    expect(artistsOwn(S[5], "her long illness and her divorce", about)).toBe(true);
    expect(artistsOwn(S[5], "her father's house appears in every work", about)).toBe(false);
    expect(artistsOwn(S[7], "celebrated internationally for her prints and paintings", about)).toBe(false);
  });
});

describe("the review of PR #12 — blocker 1: the artist's own words, by the artist's own name, from the same sentence", () => {
  const ADAMS: Context = { living: true, artist: { surname: "Adams", givenName: "Igshaan", displayName: "Igshaan Adams" } };
  const KENTRIDGE: Context = { living: true, artist: { surname: "Kentridge", givenName: "William", displayName: "William Kentridge" } };
  const HALTER: Context = { living: true, artist: { surname: "Halter", givenName: "Dan", displayName: "Dan Halter" } };
  const web = (n: number, publisher: string, passage: string): Source => ({ n, kind: "web", title: "T", publisher, link: `https://${publisher.toLowerCase().replace(/\W+/g, "")}.example/`, passage });
  const FRIEZE = web(1, "Frieze", "Igshaan Adams says he weaves every day. “His father never accepted his sexuality,” the critic Jane Doe writes.");
  const FRIEZE_AFTER = web(1, "Frieze", "“I weave every day,” Igshaan Adams says. His father, a strict imam, never accepted his sexuality, friends recall.");
  const MET = web(1, "The Metropolitan Museum of Art (the Met)", "Sydney Kentridge said his son had suffered from depression in the 1980s.");
  const ARTFORUM = web(1, "Artforum", "Dan Cameron writes that Halter's divorce shaped the work.");
  const check = (text: string, source: Source, ctx: Context) => checkSentence(s(text, [1]), [source], ctx).map((v) => v.rule);

  it("a quotation followed by its speaker belongs to that speaker, not to whoever spoke earlier", () => {
    expect(check("Adams told Frieze that “His father never accepted his sexuality”.", FRIEZE, ADAMS)).toContain(7);
    const critic = check("Jane Doe writes in Frieze that “His father never accepted his sexuality”.", FRIEZE, ADAMS);
    expect(critic).not.toContain(7);
    expect(critic).not.toContain(3);
    expect(critic).toContain(8);
    expect(artistsOwn(FRIEZE, "His father never accepted his sexuality", ADAMS)).toBe(false);
    expect(artistsOwn(FRIEZE, "he weaves every day", ADAMS)).toBe(true);
  });

  it("the writer's narration after the artist speaks is not the artist's", () => {
    expect(artistsOwn(FRIEZE_AFTER, "I weave every day", ADAMS)).toBe(true);
    expect(artistsOwn(FRIEZE_AFTER, "never accepted his sexuality", ADAMS)).toBe(false);
    const narration = check("In Frieze, Adams says his father “never accepted his sexuality”.", FRIEZE_AFTER, ADAMS);
    expect(narration).toContain(8);
    expect(check("Igshaan Adams told Frieze that “I weave every day”.", FRIEZE_AFTER, ADAMS)).toEqual([]);
  });

  it("a relative with the surname, or a critic with the given name, is not the artist", () => {
    expect(artistsOwn(MET, "his son had suffered from depression in the 1980s", KENTRIDGE)).toBe(false);
    const son = check("Kentridge told the Met that “his son had suffered from depression in the 1980s”.", MET, KENTRIDGE);
    expect(son).toContain(7);
    expect(son).toContain(8);
    expect(artistsOwn(ARTFORUM, "Halter's divorce shaped the work", HALTER)).toBe(false);
    const divorce = check("Halter has said that “Halter's divorce shaped the work”.", ARTFORUM, HALTER);
    expect(divorce).toContain(7);
    expect(divorce).toContain(8);
    expect(check("Dan Cameron writes in Artforum that “Halter's divorce shaped the work”.", ARTFORUM, HALTER)).toEqual([8]);
  });
});

describe("the review of PR #12 — blocker 2: naming the page lets no one's words be given to anyone else", () => {
  const ADAMS: Context = { living: true, artist: { surname: "Adams", givenName: "Igshaan", displayName: "Igshaan Adams" } };
  const KENTRIDGE: Context = { living: true, artist: { surname: "Kentridge", givenName: "William", displayName: "William Kentridge" } };
  const FRIEZE: Source = {
    n: 1,
    kind: "web",
    title: "Igshaan Adams",
    publisher: "Frieze",
    link: "https://frieze.example/adams",
    passage: "In the catalogue the critic Jane Doe argues that Adams's weavings are the most tender works in South African art. “I weave because my hands need to pray,” Igshaan Adams says.",
  };
  const TATE: Source = { n: 1, kind: "web", title: "T", publisher: "Tate", link: "https://tate.example/", passage: "The critic William Feaver has called the drawings the greatest of the age." };
  const check = (text: string, source: Source, ctx: Context) => checkSentence(s(text, [1]), [source], ctx).map((v) => v.rule);

  it("a critic's superlative is not the artist's, nor the artist's words the critic's — whichever page is named", () => {
    expect(check("Adams told Frieze that his weavings are “the most tender works in South African art”.", FRIEZE, ADAMS)).toContain(7);
    expect(check("In Frieze, the artist says his weavings are “the most tender works in South African art”.", FRIEZE, ADAMS)).toContain(7);
    expect(check("Jane Doe writes in Frieze that “my hands need to pray”.", FRIEZE, ADAMS)).toContain(7);
    expect(check("Kentridge has said the drawings are “the greatest of the age”.", TATE, KENTRIDGE)).toContain(7);
    expect(check("Tate records that Kentridge has said the drawings are “the greatest of the age”.", TATE, KENTRIDGE)).toContain(7);
    const r = attribution("Adams told Frieze that his weavings are", FRIEZE, ADAMS.artist ? { artist: ADAMS.artist } : {}, "the most tender works in South African art");
    expect(r).toEqual({ ok: false, rule: 7, why: "a quotation given to the artist, where the passage shows Jane Doe speaking" });
  });

  it("the right speaker named passes; the page named with no speaker passes; the page alone, where nobody is shown, passes", () => {
    expect(check("Jane Doe argues in Frieze that Adams's weavings are “the most tender works in South African art”.", FRIEZE, ADAMS)).toEqual([]);
    expect(check("For Jane Doe, the weavings are “the most tender works in South African art”.", FRIEZE, ADAMS)).toEqual([]);
    expect(check("Igshaan Adams told Frieze that “I weave because my hands need to pray”.", FRIEZE, ADAMS)).toEqual([]);
    expect(check("In Frieze the weavings are called “the most tender works in South African art”.", FRIEZE, ADAMS)).toEqual([]);
    expect(check("William Feaver has called the drawings “the greatest of the age”.", TATE, KENTRIDGE)).toEqual([]);
    expect(check("In Tate's words, the drawings are “the greatest of the age”.", TATE, KENTRIDGE)).toEqual([]);
    // the artist named where the passage shows nobody: no longer carried by the page — removed, failing safe (19 Nov, below)
    expect(rulesOf("Test Painter told Harbour Gallery that *Blue Field* is “the artist's finest work”.", [1], about)).toContain(7);
  });
});

describe("the pre-flight check of 19 Nov — the artist is never given quoted words on the page's say-so alone", () => {
  const ADAMS: Context = { living: true, artist: { surname: "Adams", givenName: "Igshaan", displayName: "Igshaan Adams" } };
  // the critic named by surname only, and the critic unnamed: the code cannot follow either back to a name it knows
  const BY_SURNAME: Source = { n: 1, kind: "web", title: "Igshaan Adams", publisher: "Frieze", link: "https://frieze.example/adams", passage: "Doe argues that the weavings are the most tender works in South African art." };
  const UNNAMED: Source = { n: 1, kind: "web", title: "Igshaan Adams", publisher: "Frieze", link: "https://frieze.example/adams", passage: "The magazine's critic argues that the weavings are the most tender works in South African art." };
  const check = (text: string, source: Source) => checkSentence(s(text, [1]), [source], ADAMS).map((v) => v.rule);

  it("removes a quotation given to the artist where the passage shows no one speaking — whichever page is named", () => {
    for (const src of [BY_SURNAME, UNNAMED]) {
      expect(check("Adams told Frieze that his weavings are “the most tender works in South African art”.", src)).toContain(7);
      expect(check("In Frieze, the artist says his weavings are “the most tender works in South African art”.", src)).toContain(7);
      expect(check("Igshaan Adams has said his weavings are “the most tender works in South African art”.", src)).toContain(7);
    }
    expect(attribution("Adams told Frieze that his weavings are", BY_SURNAME, { artist: ADAMS.artist }, "the most tender works in South African art")).toEqual({
      ok: false,
      rule: 7,
      why: "a quotation given to the artist, where the passage shows no one speaking",
    });
  });

  it("the page named with no speaker still passes, and so does the artist's own supplied text, and the artist shown speaking", () => {
    expect(check("In Frieze the weavings are called “the most tender works in South African art”.", BY_SURNAME)).toEqual([]);
    expect(check("Frieze describes the weavings as “the most tender works in South African art”.", UNNAMED)).toEqual([]);
    expect(rulesOf("Test Painter wrote: “I painted Blue Field over one winter in a cold studio.”", [2])).toEqual([]);
    expect(rulesOf("Test Painter told the museum that she paints “what I remember”.", [4], about)).toEqual([]);
  });
});

describe("the pre-flight check of 19 Nov — where a living artist lives or works, closer than a city and a country (18 Nov)", () => {
  const WHERE: Source = {
    n: 1,
    kind: "web",
    title: "Igshaan Adams",
    publisher: "blank projects",
    link: "https://blank.example/adams",
    passage: "His studio is in Bonteheuwel. He works at 12 Example Road, Bonteheuwel. The Bag Factory studios in Johannesburg gave him a residency. He lives and works in Cape Town, South Africa.",
  };
  const living: Context = { living: true, artist: { surname: "Adams", givenName: "Igshaan", displayName: "Igshaan Adams" } };
  const dead: Context = { ...living, living: false };
  const check = (text: string, ctx: Context = living) => checkSentence(s(text, [1]), [WHERE], ctx);

  it("catches a street address and the studio's whereabouts, in code, under rule 8", () => {
    for (const t of [
      "His studio is in Bonteheuwel.",
      "He works at 12 Example Road, Bonteheuwel.",
      "She works from her studio in Woodstock.",
      "The artist keeps a studio at 4 Harbour Street.",
      "Adams works from a studio in Cape Town.",
      "The studio was located in Salt River.",
      "Her address is 221B Baker St.",
    ]) {
      const v = check(t);
      expect(v.map((x) => x.rule), t).toContain(8);
      expect(v.find((x) => x.rule === 8)?.why, t).toMatch(/closer than a city and a country/);
    }
    expect(check("He works at 12 Example Road, Bonteheuwel.").find((x) => x.rule === 8)?.match).toBe("12 Example Road");
    expect(check("His studio is in Bonteheuwel.").find((x) => x.rule === 8)?.match).toBe("studio is in");
    // a capitalised place is what the code asks for (the review of PR #14)
    expect(check("Their studios in Berlin and Cape Town are shared.").map((x) => x.rule)).toContain(8);
    expect(check("Studio is at 4 Harbour Street.").map((x) => x.rule)).toContain(8);
  });

  it("does not read a year as a house number, nor a lower-case word as a place — narrow by design (the review of PR #14)", () => {
    for (const t of ["In 2012 Trafalgar Square hosted his sculpture.", "Her 2019 Times Square billboard drew crowds.", "The studio is in her house.", "By 1994 Church Square had changed."]) {
      expect(check(t).map((x) => x.rule), t).not.toContain(8);
    }
    // what the code does not reach is the brief's and the second reading's
    for (const t of ["He works at 45 main road.", "She keeps a studio on Bree Street.", "Her Woodstock studio is small.", "Her studio, in Woodstock, is small.", "He lived at 12 Rue de Rivoli."]) {
      expect(check(t).map((x) => x.rule), t).not.toContain(8);
    }
  });

  it("leaves a city and a country, a studio complex by name, a studio with no whereabouts, and a title alone", () => {
    for (const t of [
      "He lives and works in Cape Town, South Africa.",
      "The Bag Factory studios in Johannesburg gave him a residency.",
      "He works in a small studio.",
      "He painted *12 Example Road* in 2019.",
      "In 1994 he moved to Cape Town.",
    ]) {
      expect(check(t).map((x) => x.rule), t).not.toContain(8);
    }
  });

  it("is a rule for the living: a dead artist's former address is left to the brief and the second reading", () => {
    expect(check("His studio was in Bonteheuwel.", dead).map((x) => x.rule)).not.toContain(8);
    expect(check("He worked at 12 Example Road.", dead).map((x) => x.rule)).not.toContain(8);
  });
});

describe("rules 4, 5, 7, 8 and 10", () => {
  it("every sentence has a source that exists; the list's own sentence needs none", () => {
    expect(rulesOf("She was born in Durban in 1980.", [])).toContain(4);
    expect(rulesOf("She was born in Durban in 1980.", [9])).toContain(4);
    expect(rulesOf("She was born in Durban in 1980.", [1])).toEqual([]);
    expect(rulesOf(NOT_ENOUGH, [])).toEqual([]);
  });

  it("never touches the sensitive classes — in a quotation either — nor the collection's owner, by name", () => {
    for (const t of ["The painting hangs in a private collection.", "It is insured for its full value.", "The work is in poor condition.", "It is owned by a family in Durban."]) {
      expect(rulesOf(t), t).toContain(5);
    }
    // the review's bypass: ownership inside a correctly quoted and attributed passage
    const quoted = rulesOf("The Art Newspaper reports the work “is now in the private collection of a Johannesburg banker”.", [7]);
    expect(quoted).toContain(5);
    expect(quoted).not.toContain(3);
    const never = { living: true, neverName: ["Sample Owner", "Owner"] };
    expect(rulesOf("She painted it for Sample Owner in 2019.", [1], never)).toContain(5);
    expect(rulesOf("The owner of the gallery spoke.", [1], never)).toContain(5);
    expect(rulesOf("She lives in Cape Town.", [1], never)).toEqual([]);
  });

  it("no invented voices: the first person is never the desk's — a title in italics is the work's words, not the desk's", () => {
    expect(rulesOf("I painted it in a cold studio.", [2])).toContain(7);
    expect(rulesOf("We see here a painter at work.")).toContain(7);
    expect(rulesOf("This work speaks to me.")).toContain(7);
    expect(rulesOf("The US flag appears in one work.")).not.toContain(7);
    // the live run of 18 Nov: *Why Should I Hesitate* is a title, and the "I" in it is Kentridge's, not ours
    expect(italicsIn("Shown in *Why Should I Hesitate: Putting drawings to work* at Zeitz MOCAA.").map((t) => t.text)).toEqual(["Why Should I Hesitate: Putting drawings to work"]);
    expect(rulesOf("Her work was surveyed in *Why Should I Hesitate: Putting drawings to work* in 2019.")).toEqual([]);
    expect(rulesOf("Her work *My Mother's House* and her series *The Most Important Thing* were shown in 2019.")).toEqual([]);
    expect(rulesOf("Her work *My Mother's House* was shown, and I saw it.")).toContain(7);
    // a title is read like a quotation: it still cannot carry a sum, a sale or a sensitive class
    expect(rulesOf("Her series *Sold at Christie's* was shown in 2019.")).toContain(2);
  });

  it("private lives stay private — for the living, in anyone's words but the artist's own, given to the artist", () => {
    expect(rulesOf("She was recently divorced.")).toContain(8);
    expect(rulesOf("She was recently divorced.", [1], { living: false })).not.toContain(8);
    for (const t of ["Her father is a trial lawyer.", "Her mother and brother live in Durban.", "She has a partner and two sons.", "She has spoken of her sexuality."]) {
      expect(rulesOf(t, [6], about), t).toContain(8);
      expect(rulesOf(t, [6], { living: false, artist: about.artist }), t).not.toContain(8);
    }
    expect(PRIVATE_WORDS).toContain("father");
    // hyphens hide nothing, and the words the review found missing (should-fix 2)
    for (const t of ["His ex-wife is a painter.", "His half-brother lives in Durban.", "Her mother-in-law sat for her.", "His step-father raised him.", "Her stepfather raised her.", "She has a child.", "Her spouse is a writer.", "His fiancée sat for him."]) {
      expect(rulesOf(t), t).toContain(8);
    }
    // a material, not a mother
    expect(rulesOf("She works in mother-of-pearl and brass.")).toEqual([]);
    // the artist's own words, quoted and given to the artist: allowed
    expect(rulesOf("Test Painter has spoken of “her long illness and her divorce”.", [6], about)).toEqual([]);
    expect(rulesOf("Test Painter has written that “The blue is the blue of the bay in July, which I wanted to keep.”", [2])).toEqual([]);
    // the same words given to the magazine, or a third party's remark about her family, quoted exactly: not allowed
    expect(rulesOf("ART AFRICA notes that she “spoke of her long illness and her divorce”.", [6], about)).toContain(8);
    expect(rulesOf("Sam Sample has written that “her father’s house appears in every work”.", [6], about)).toContain(8);
    // capitals count: a quotation keeps the passage's case
    expect(rulesOf("Test Painter has written that “the blue is the blue of the bay in July”.", [2])).toContain(7);
  });

  it("when unsure, write less: why they matter in two sentences and sixty words, a biography of 250 — counted as real sentences", () => {
    expect(sentenceCount("She was born in Durban (b. 1980). She lives in Cape Town.")).toBe(2);
    expect(sentenceCount("W. Kentridge was born in 1955.")).toBe(1);
    expect(sentenceCount("Is it? Yes! It is.")).toBe(3);
    expect(sentenceCount(`She paints. ${NOT_ENOUGH}`)).toBe(2);
    expect(sentenceCount("No full stop")).toBe(1);
    expect(sentenceCount("It is 2.4m wide, made c. 1990 with Dr. Sample.")).toBe(1);
    expect(sentenceCount("She said “It is done.” Then she left.")).toBe(2);

    // M2-04d: why they matter is counted in clips, two at most — a clip may hold more than one sentence
    const r = trimToLength("why_they_matter", [s("“A painter of light.” — Ann Critic, *Harbour Painters* (2001)"), s("“Two. Sentences.” — Ann Critic"), s("“A third.” — Ann Critic")]);
    expect(r.kept.map((x) => x.text)).toEqual(["“A painter of light.” — Ann Critic, *Harbour Painters* (2001)", "“Two. Sentences.” — Ann Critic"]);
    expect(r.removed).toEqual([{ text: "“A third.” — Ann Critic", rule: "length", why: "why they matter is at most two clips" }]);
    expect(trimToLength("why_they_matter", [s("“One. Two. Three.” — Ann Critic")]).removed).toEqual([]);
    const long = "word ".repeat(91).trim() + ".";
    expect(trimToLength("why_they_matter", [s(long)]).removed[0].why).toBe("over 90 words");
    const thirty = s("w ".repeat(29).trim() + " end.");
    const bio = checkField("biography", Array.from({ length: 9 }, () => thirty), S, living);
    expect(bio.kept).toHaveLength(8);
    expect(bio.removed[0].why).toBe("over 250 words");
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
    // the review's bypasses and missing phrasings (M2-04b)
    { text: "The Art Newspaper reported that the work “sold for £1.2m at Christie’s”.", sources: [7], rule: 2 },
    { text: "The Art Newspaper reports the work “is now in the private collection of a Johannesburg banker”.", sources: [7], rule: 5 },
    { text: "ART AFRICA notes that she “spoke of her long illness and her divorce”.", sources: [6], rule: 8 },
    { text: "Sam Sample has written that “her father’s house appears in every work”.", sources: [6], rule: 8 },
    { text: "Living in Cape Town, she is “the most significant artist” of her generation.", sources: [5], rule: 3 },
    { text: "Critics read her as “the most significant artist” of her generation.", sources: [5], rule: 3 },
    { text: "The artist is, in her own account, “celebrated internationally for her prints and paintings”.", sources: [8], rule: 3 },
    { text: "Tate calls her early work “important”.", sources: [5], rule: 7 },
    { text: "A million-dollar painting.", rule: 2 },
    { text: "It made millions of dollars.", rule: 2 },
    { text: "It brought tens of thousands of pounds.", rule: 2 },
    { text: "It went for 2.4m rand.", rule: 2 },
    { text: "It cost thirty dollars.", rule: 2 },
    { text: "A seven-figure sum changed hands.", rule: 2 },
    { text: "It sold at Christie's.", rule: 2 },
    { text: "The top lot at Sotheby's.", rule: 2 },
    { text: "Her work rose sharply in value.", rule: 2 },
    { text: "Collectors compete for her work.", rule: 2 },
    { text: "Africa's most exciting painter.", rule: 6 },
    { text: "One of South Africa's most collected artists.", rule: 6 },
    { text: "A well-known painter.", rule: 6 },
    { text: "An eminent and lauded figure, hailed for a landmark show.", rule: 6 },
    { text: "Her father is a trial lawyer.", sources: [6], rule: 8 },
    { text: "Her mother and brother live in Durban.", sources: [6], rule: 8 },
    { text: "She has a partner and two sons.", sources: [6], rule: 8 },
    { text: "This work speaks to me.", rule: 7 },
    // the review of PR #12
    { text: "The artist says she is “interested in the harbour, not as a view but as a place of work”.", sources: [4], rule: 7 },
    { text: "Steeped in South African history, she is “the most significant artist” of her generation.", sources: [5], rule: 3 },
    { text: "A sell-out show.", rule: 2 },
    { text: "It was estimated to reach a record.", rule: 2 },
    { text: "It was offered at Phillips in the evening sale.", rule: 2 },
    { text: "A world-famous and much-lauded painter.", rule: 6 },
    { text: "His ex-wife and half-brother sat for him.", rule: 8 },
    { text: "Her stepfather and her child appear in the work.", rule: 8 },
    { text: "Test Painter was born in Durban in 1980 and studied at the Michaelis School of Fine Art.", rule: 7 },
  ];
  // the artist is named in the context here, as the desk names them
  const ctx: Context = { living: true, artist: about.artist };
  it.each(bad)("catches: $text", ({ text, sources, rule }) => {
    expect(checkSentence(s(text, sources ?? [1]), S, ctx).map((v) => v.rule)).toContain(rule);
  });

  const good: { text: string; sources: number[] }[] = [
    { text: "Born in Durban in 1980, Test Painter studied at the Michaelis School of Fine Art.", sources: [1] },
    { text: "She lives and works in Cape Town.", sources: [1] },
    { text: "*Harbour at Dusk* entered the collection of the Iziko Museums of South Africa in 2022.", sources: [3] },
    { text: "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”", sources: [2] },
    { text: "Harbour Gallery describes her as “one of the most important painters of her generation”.", sources: [1] },
    { text: "Harbour Gallery calls *Blue Field* ‘the artist’s finest work’.", sources: [1] },
    { text: "Ann Example has written that she is “interested in the harbour, not as a view but as a place of work”.", sources: [4] },
    { text: "Most of her works are on paper.", sources: [1] },
    { text: "Her most recent show was in Cape Town, with Everard Read.", sources: [5] },
    { text: "She is best known for her prints, which she makes in mother-of-pearl and brass.", sources: [1] },
    { text: "Test Painter told the museum that she paints “what I remember”, as Tate records.", sources: [4] },
    { text: NOT_ENOUGH, sources: [] },
  ];
  it.each(good)("passes: $text", ({ text, sources }) => {
    expect(checkSentence(s(text, sources), S, ctx)).toEqual([]);
  });

  it("a whole good biography comes through whole, and a whole bad one does not", () => {
    const biography = checkField("biography", good.slice(0, 7).map((g) => s(g.text, g.sources)), S, ctx);
    expect(biography.removed).toEqual([]);
    expect(biography.kept).toHaveLength(7);
    const faults = checkField("biography", bad.map((b) => s(b.text, b.sources ?? [1])), S, ctx);
    expect(faults.kept).toEqual([]);
    expect(faults.removed.map((r) => r.rule)).toEqual(bad.map((b) => b.rule));
  });
});
