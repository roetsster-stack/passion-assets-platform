/** M2-04 · The report Michael reads: drafts marked as drafts, the sources beside them, what was removed and why. */
import { describe, expect, it } from "vitest";
import { renderReport } from "@/lib/drafting/report";
import { NOT_ENOUGH, type Draft } from "@/lib/drafting/types";

const draft: Draft = {
  artist: { id: "a", displayName: "Test Painter", surname: "Painter", givenName: "Test", nationality: [], birthYear: null, deathYear: null, works: [] },
  listVersion: "0123456789abcdef0123456789abcdef01234567",
  model: "claude-test-5",
  sources: [{ n: 2, kind: "web", title: "Test Painter", publisher: "Harbour Gallery", link: "https://harbour-gallery.example/p", passage: "She lives and works in Cape Town." }],
  fields: [
    {
      field: "biography",
      sentences: [{ text: "She lives and works in Cape Town.", sources: [2] }],
      text: "She lives and works in Cape Town.",
      removed: [
        { text: "Her work is a sound investment.", rule: 2, why: "rule 2: a word of the market (“investment”)" },
        { text: "She lives and works in Cape Town. She paints the harbour in winter.", rule: "shortened", why: "shortened by the model from 260 to 240 words — this is the longer version, as it stood before" },
      ],
      flagged: [{ text: "She paints.", why: "doubtful" }],
    },
    { field: "why_they_matter", sentences: [{ text: NOT_ENOUGH, sources: [] }], text: NOT_ENOUGH, removed: [], flagged: [] },
  ],
  usage: { requests: 4, inputTokens: 12345, outputTokens: 678, webSearches: 3 },
  notes: ["no supplied text"],
  answers: { biography: { draftId: "00000000-0000-4000-8000-0000000000d1", note: "too much about the films; say more about the prints" } },
};
const meta = {
  date: new Date("2026-11-17T10:00:00Z"),
  listPath: "docs/drafting/prohibition-list.md",
  listVersion: draft.listVersion,
  model: "claude-test-5",
  allowlistPath: "docs/drafting/sources-allowlist.md",
  sites: [{ domain: "harbour-gallery.example", name: "Harbour Gallery" }],
  unresolved: [{ domain: "gone.example", name: "Gone" }],
  contextDir: "/ctx",
  table: "missing" as const,
  failures: [{ artist: "Nobody", error: "the model declined to draft" }],
};

describe("the report", () => {
  it("marks every draft as a draft, shows the sentences with their source numbers, the sources, the removed and the flagged", () => {
    const md = renderReport([draft], meta);
    expect(md).toContain("# Drafts — 2026-11-17");
    expect(md).toContain("version `0123456789abcdef0123456789abcdef01234567`");
    expect(md).toContain("## Test Painter");
    expect(md).toContain("_DRAFT — not approved. List 0123456789ab · model claude-test-5 · 4 requests, 3 searches, 12,345 in / 678 out._");
    expect(md).toContain("**Biography.** She lives and works in Cape Town. [2]");
    expect(md).toContain(`**Why they matter.** ${NOT_ENOUGH}`);
    expect(md).toContain("- [2] Test Painter — Harbour Gallery — https://harbour-gallery.example/p\n  > She lives and works in Cape Town.");
    expect(md).toContain("- (Biography; rule 2) “Her work is a sound investment.” — rule 2: a word of the market (“investment”)");
    // the longer version, as one entry (19 Nov); and the owner's note the draft answers (M2-01)
    expect(md).toContain("- (Biography; shortened) “She lives and works in Cape Town. She paints the harbour in winter.” — shortened by the model from 260 to 240 words — this is the longer version, as it stood before");
    expect(md).toContain("_Written to answer the owner's note on the previous biography: “too much about the films; say more about the prints”._");
    expect(md).toContain("- (Biography) “She paints.” — doubtful");
    expect(md).toContain("did not resolve and were not searched: gone.example");
    expect(md).toContain("not created yet (the migration awaits a yes)");
    expect(md).toContain("- Not drafted: Nobody (the model declined to draft)");
    expect(md).toContain("_In all: 4 requests, 3 web searches, 12,345 input tokens, 678 output tokens._");
  });
});
