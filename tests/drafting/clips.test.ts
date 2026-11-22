/**
 * M2-04d · "Why they matter" as the critical voice: a clip is one verbatim quotation and its attribution line,
 * nothing of the desk's own; never the artist's own words (those belong in the biography); two at most, counted
 * after the second reading; `--field` keeps a new "why they matter" off an approved biography.
 */
import { describe, expect, it } from "vitest";
import { fieldOption, onlyFields } from "@/lib/drafting/pending";
import { checkClips, MAX_CLIPS, parseClip } from "@/lib/drafting/rules";
import { NOT_ENOUGH, type Draft, type Source } from "@/lib/drafting/types";

const critic: Source = { n: 1, kind: "book", title: "Critic, *Harbour Painters* (2001), p. 12", publisher: "Ann Critic", link: null, passage: "Her blues are taken from the bay in winter." };
const own: Source = { n: 2, kind: "supplied", title: "Test Painter — in her own words", publisher: "Test Painter (the artist)", link: null, passage: "I keep the winter blue." };
const ctx = { living: true, artist: { surname: "Painter", givenName: "Test", displayName: "Test Painter" } };
const s = (text: string, sources: number[] = [1]) => ({ text, sources });

describe("a clip", () => {
  it("is one quotation, an em dash and its attribution", () => {
    expect(parseClip("“Her blues are taken from the bay in winter.” — Ann Critic, *Harbour Painters* (2001)")).toEqual({
      quote: "Her blues are taken from the bay in winter.",
      attribution: "Ann Critic, *Harbour Painters* (2001)",
    });
    expect(parseClip('"taken from the bay" – Ann Critic.')).toEqual({ quote: "taken from the bay", attribution: "Ann Critic" });
  });

  it("is not a sentence of the desk's own, two quotations, or a quotation with no one to say it", () => {
    expect(parseClip("Ann Critic writes that “Her blues are taken from the bay in winter.”")).toBeNull();
    expect(parseClip("“Her blues” and “the bay” — Ann Critic")).toBeNull();
    expect(parseClip("“Her blues are taken from the bay in winter.”")).toBeNull();
    expect(parseClip("Her blues are taken from the bay. — Ann Critic")).toBeNull();
  });
});

describe("why they matter, the critical voice", () => {
  it("keeps a critic's clip and the list's own sentence", () => {
    const r = checkClips([s("“Her blues are taken from the bay in winter.” — Ann Critic, *Harbour Painters* (2001)"), s(NOT_ENOUGH, [])], [critic, own], ctx);
    expect(r.kept).toHaveLength(2);
    expect(r.removed).toEqual([]);
  });

  it("removes the desk's own words, and never lets the artist speak here", () => {
    const r = checkClips(
      [
        s("Ann Critic writes that “Her blues are taken from the bay in winter.”"),
        s("“I keep the winter blue.” — Test Painter", [2]),
        s("“I keep the winter blue.” — the artist", [2]),
        s("“Her blues are taken from the bay in winter.” — Test Painter, in conversation"),
      ],
      [critic, own],
      ctx,
    );
    expect(r.kept).toEqual([]);
    expect(r.removed.map((x) => x.rule)).toEqual([3, 3, 3, 3]);
    expect(r.removed[0].why).toContain("no words of the desk's own");
    expect(r.removed[1].why).toContain("belong in the biography");
  });

  it("keeps the attribution to who and where", () => {
    const r = checkClips([s(`“Her blues are taken from the bay in winter.” — Ann Critic, ${"who also wrote a great many other things ".repeat(4)}`)], [critic], ctx);
    expect(r.removed[0].why).toContain("who and where");
  });

  it("allows two clips at most", () => {
    expect(MAX_CLIPS).toBe(2);
  });
});

describe("--field", () => {
  it("names one field or refuses", () => {
    expect(fieldOption(undefined)).toBeNull();
    expect(fieldOption("why_they_matter")).toBe("why_they_matter");
    expect(fieldOption("biography")).toBe("biography");
    expect(() => fieldOption("bio")).toThrow("--field must be one of: biography, why_they_matter");
  });

  it("keeps only that field of a draft, with the sources it cites", () => {
    const draft = {
      artist: { id: "a", displayName: "Test Painter", surname: "Painter", givenName: "Test", nationality: [], birthYear: null, deathYear: null, works: [] },
      listVersion: "v",
      model: "m",
      sources: [critic, own],
      fields: [
        { field: "biography", sentences: [s("She keeps the winter blue.", [2])], text: "She keeps the winter blue.", removed: [], flagged: [] },
        { field: "why_they_matter", sentences: [s("“Her blues are taken from the bay in winter.” — Ann Critic")], text: "x", removed: [], flagged: [] },
      ],
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 },
      notes: [],
    } as Draft;
    const only = onlyFields(draft, ["why_they_matter"]);
    expect(only.fields.map((f) => f.field)).toEqual(["why_they_matter"]);
    expect(only.sources.map((x) => x.n)).toEqual([1]);
  });
});
