/**
 * M2-04c · Books as sources, against a hand-written fixture book (never a real book's text): a book's
 * citation from its book.md; an artist's extract files found by surname, suffixed names included, never
 * from the inbox or a folder with no book.md; only files whose status begins CHECKED; never a passage
 * with a [?], with no page, or a checker's note; a book by the artist is the artist's own words; the
 * Literature form for readers, with no read date; the desk numbers books after the supplied texts, gives
 * them no read date, and keeps of a book only the sentences the text cites (the approved trade-off).
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { draftArtist } from "@/lib/drafting/desk";
import { clause, isChecked, libraryFilesFor, librarySources, pageOf, parseBook, sentencesOf, trimPassage } from "@/lib/drafting/library";
import { loadList } from "@/lib/drafting/list";
import { suppliedSources } from "@/lib/drafting/sources";
import type { ArtistInput, Source } from "@/lib/drafting/types";
import { pageKey, readOn, sourceLabel } from "@/lib/gallery/texts";
import { standIn } from "./stand-in";

const root = path.resolve(__dirname, "..", "..");
const CONTEXT = path.join(__dirname, "fixtures", "context");
const list = loadList(path.join(root, "docs", "drafting", "prohibition-list.md"));

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

describe("the library: books as sources", () => {
  it("reads a book's citation: the Literature form without its page, and the whole citation", () => {
    const book = parseBook(
      `# Harbour Painters\n\n- **Title:** *Harbour Painters*\n- **Author:** Ann Critic. Foreword by A. N. Other\n- **Publisher:** Example Press, Cape Town\n- **Year:** 2001 (first edition)\n- **Literature form:** Critic, *Harbour Painters* (2001), p. n\n`,
    );
    expect(book).toEqual({ short: "Critic, *Harbour Painters* (2001)", full: "Ann Critic, *Harbour Painters* (Example Press, Cape Town, 2001)" });
    expect(parseBook("# A book\n\n- **Title:** *A book*\n")).toBeNull();
    expect(clause("Courtney J. Martin (ed.); essays by others")).toBe("Courtney J. Martin (ed.)");
    expect(clause("Sue Williamson. Appreciation by Elton John")).toBe("Sue Williamson");
    expect(clause("Stevenson (ed. Sophie Perryer)")).toBe("Stevenson (ed. Sophie Perryer)");
    // an editor, an artist's monograph, a note after the title
    expect(
      parseBook(`# M\n\n- **Title:** *Material Acts* (a label)\n- **Artist:** Test Painter. Texts by others\n- **Editor:** Ed Itor · Design Some One\n- **Publisher:** Example Press, Cape Town (distributed by D.A.P.)\n- **Year:** 2018 (© the authors)\n- **Literature form:** Painter, *Material Acts* (2018), p. n\n`)?.full,
    ).toBe("Test Painter, *Material Acts*, ed. Ed Itor (Example Press, Cape Town, 2018)");
    expect(parseBook(`# F\n\n- **Title:** *Four Painters*\n- **Editor:** Courtney J. Example\n- **Literature form:** Example (ed.), *Four Painters* (2016), p. n\n`)?.full).toBe("Courtney J. Example (ed.), *Four Painters*");
  });

  it("finds the page in a passage's heading, or none", () => {
    expect(pageOf("p. 164")).toBe("p. 164");
    expect(pageOf("Biographies, p. 309")).toBe("p. 309");
    expect(pageOf("p. 10 (scan page 14)")).toBe("p. 10");
    expect(pageOf("'I ask myself', pp. 9–39 (scan page 16; printed page to confirm)")).toBe("pp. 9–39");
    expect(pageOf("pp. 40-41")).toBe("pp. 40–41");
    expect(pageOf("Index (pages where the book discusses or illustrates the artist)")).toBeNull();
    expect(pageOf(null)).toBeNull();
  });

  it("reads only a file someone has checked against the page", () => {
    expect(isChecked("# T\n\n- **Status:** CHECKED, 21 Nov 2026: read against the page images.\n\n---\n\nText.")).toBe(true);
    expect(isChecked("# T\n\n- **Status:** PROPOSED, from text recognition.\n\n---\n\nText.")).toBe(false);
    expect(isChecked("# T\n\n---\n\nText.")).toBe(false);
  });

  it("finds an artist's extracts by surname across the books, suffixed names too, never in the inbox or a folder with no book.md", () => {
    const files = libraryFilesFor(CONTEXT, { surname: "PAÍNTER" }).map((f) => path.relative(path.join(CONTEXT, "library"), f));
    expect(files).toEqual(["Critic_HarbourPainters_2001/Painter_Test.md", "Critic_HarbourPainters_2001/Painter_Test_Draft.md", "Critic_HarbourPainters_2001/Painter_Test_Notes.md"]);
    expect(libraryFilesFor(CONTEXT, { surname: "Critic" })).toEqual([]);
    expect(libraryFilesFor(path.join(CONTEXT, "nowhere"), { surname: "Painter" })).toEqual([]);
  });

  it("becomes book sources: Literature form with the page, the author as publisher, no link, no read date — and nothing unchecked, unread or unpaged", () => {
    const sources = librarySources(CONTEXT, { surname: "Painter" });
    expect(sources).toEqual([
      {
        kind: "book",
        title: "Critic, *Harbour Painters* (2001), p. 12",
        publisher: "Ann Critic",
        link: null,
        passage: "Test Painter paints the harbour at dusk. Her blues are taken from the bay in winter. She works slowly, one canvas a season.",
        book: "Ann Critic, *Harbour Painters* (Example Press, Cape Town, 2001)",
      },
      {
        kind: "book",
        title: "Critic, *Harbour Painters* (2001), pp. 40–41",
        publisher: "Ann Critic",
        link: null,
        passage: "Her studio faces the sea.",
        book: "Ann Critic, *Harbour Painters* (Example Press, Cape Town, 2001)",
      },
      {
        kind: "book",
        title: "Critic, *Harbour Painters* (2001), p. 50",
        publisher: "Test Painter (the artist)",
        link: null,
        passage: "I keep the winter blue.",
        book: "Ann Critic, *Harbour Painters* (Example Press, Cape Town, 2001)",
      },
    ]);
    const all = JSON.stringify(sources);
    expect(all).not.toContain("[?]");
    expect(all).not.toContain("nobody has checked");
    expect(all).not.toContain("Never a source");
    expect(all).not.toContain("Cut at the last whole sentence");
    expect(all).not.toContain("Painter, Test, 12");
    expect(librarySources(null, { surname: "Painter" })).toEqual([]);
  });

  it("names a book for readers as a catalogue's Literature does, with no read date, one entry per page", () => {
    const s: Source = { n: 1, kind: "book", title: "Critic, *Harbour Painters* (2001), p. 12", publisher: "Ann Critic", link: null, passage: "x" };
    expect(sourceLabel(s)).toBe("Critic, *Harbour Painters* (2001), p. 12");
    expect(readOn(s, "2026-11-21T10:00:00.000Z")).toBeNull();
    expect(readOn({ kind: "web", readAt: "2026-11-21T10:00:00.000Z" }, "2026-11-20T10:00:00.000Z")).toBe("read 21 Nov 2026");
    expect(pageKey(s)).not.toBe(pageKey({ ...s, title: "Critic, *Harbour Painters* (2001), p. 13" }));
  });
});

describe("the trim: of a book, only the sentences the text cites", () => {
  const passage = "Test Painter paints the harbour at dusk. Her blues are taken from the bay in winter. She works slowly, one canvas a season.";

  it("splits a passage into its sentences", () => {
    expect(sentencesOf(passage)).toEqual(["Test Painter paints the harbour at dusk.", "Her blues are taken from the bay in winter.", "She works slowly, one canvas a season."]);
  });

  it("keeps the sentence a quotation comes from, and no more", () => {
    expect(trimPassage(passage, ["Ann Critic writes that “Her blues are taken from the bay in winter.”"])).toBe("Her blues are taken from the bay in winter.");
  });

  it("keeps every sentence a quotation runs across", () => {
    expect(trimPassage(passage, ["Ann Critic writes: “at dusk. Her blues”"])).toBe("Test Painter paints the harbour at dusk. … Her blues are taken from the bay in winter.");
  });

  it("for a paraphrase, keeps the one sentence it shares most words with", () => {
    expect(trimPassage(passage, ["Ann Critic notes that she works slowly, finishing one canvas each season."])).toBe("She works slowly, one canvas a season.");
  });

  it("leaves a one-sentence passage whole", () => {
    expect(trimPassage("Her studio faces the sea.", ["Anything."])).toBe("Her studio faces the sea.");
  });
});

describe("the desk with books", () => {
  it("numbers books after the supplied texts, gives them no read date, and stores only the cited sentence of a book", async () => {
    const { model, calls } = standIn({
      answer: {
        biography: [{ text: "Of *Blue Field*, Test Painter has written: “The blue is the blue of the bay in July, which I wanted to keep.”", sources: [1] }],
        whyTheyMatter: [{ text: "Ann Critic writes that “Her blues are taken from the bay in winter.”", sources: [3] }],
      },
    });
    const draft = await draftArtist(
      painter,
      { model, list, sites: [], supplied: (a) => [...suppliedSources(CONTEXT, a), ...librarySources(CONTEXT, a)] },
      { now: () => new Date("2026-11-21T10:00:00.000Z") },
    );
    // the model saw the supplied texts first, then the book passages, each a book with its page
    expect(calls.draft[0].sources.map((s) => s.kind)).toEqual(["supplied", "supplied", "book", "book", "book"]);
    expect(calls.draft[0].sources[2].passage).toContain("She works slowly");
    const why = draft.fields.find((f) => f.field === "why_they_matter")!;
    expect(why.text).toBe("Ann Critic writes that “Her blues are taken from the bay in winter.”");
    const book = draft.sources.find((s) => s.kind === "book")!;
    expect(book.title).toBe("Critic, *Harbour Painters* (2001), p. 12");
    expect(book.readAt).toBeUndefined();
    expect(book.passage).toBe("Her blues are taken from the bay in winter.");
    const supplied = draft.sources.find((s) => s.kind === "supplied")!;
    expect(supplied.readAt).toBe("2026-11-21T10:00:00.000Z");
  });
});
