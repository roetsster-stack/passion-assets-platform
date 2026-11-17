/**
 * M2-04 · Supplied texts and the allowlist: a supplied file becomes passages the model can cite and
 * the checker can match; files are found by surname without case or diacritics; the allowlist is
 * a short file of domains, and nothing outside it is ever a source.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDomain, loadAllowlist, MAX_SITES, parseAllowlist, resolving, siteFor } from "@/lib/drafting/allowlist";
import { fold, parseSuppliedText, suppliedFilesFor, suppliedSources } from "@/lib/drafting/sources";

const root = path.resolve(__dirname, "..", "..");
const CONTEXT = path.join(__dirname, "fixtures", "context");

describe("supplied texts", () => {
  it("reads a supplied file into passages with their headings, the author as publisher, the document as title", () => {
    const t = parseSuppliedText(
      `# Test Painter — in her own words\n\n<!-- source metadata, not part of her text -->\n- **Author:** Test Painter (the artist).\n- **Document:** "Notes for the register" (Word), sent on 1 November 2026.\n\n---\n\n***Blue Field*** 2019\n\nFirst line.\nSecond line of the same paragraph.\n\nA second paragraph.\n\n## Harbour at Dusk\n\nAbout waiting.\n`,
      "Painter_Test.md",
    );
    expect(t.title).toBe("Test Painter — in her own words");
    expect(t.document).toBe('"Notes for the register" (Word), sent on 1 November 2026');
    expect(t.publisher).toBe("Test Painter (the artist)");
    expect(t.passages).toEqual([
      { heading: "Blue Field 2019", text: "First line. Second line of the same paragraph." },
      { heading: "Blue Field 2019", text: "A second paragraph." },
      { heading: "Harbour at Dusk", text: "About waiting." },
    ]);
  });

  it("finds an artist's files by surname, without case or diacritics, and never another's", () => {
    expect(suppliedFilesFor(CONTEXT, { surname: "Painter" }).map((f) => path.basename(f))).toEqual(["Painter_Test.md"]);
    expect(suppliedFilesFor(CONTEXT, { surname: "PAÍNTER" }).map((f) => path.basename(f))).toEqual(["Painter_Test.md"]);
    expect(suppliedFilesFor(CONTEXT, { surname: "Paint" })).toEqual([]);
    expect(suppliedFilesFor(CONTEXT, { surname: "Test" })).toEqual([]);
    expect(suppliedFilesFor(path.join(CONTEXT, "nowhere"), { surname: "Painter" })).toEqual([]);
    expect(fold("Wa Lehulere")).toBe("walehulere");
    expect(fold("Naudé")).toBe("naude");
  });

  it("becomes sources: supplied, the artist as publisher, no link, the metadata comment left out", () => {
    const sources = suppliedSources(CONTEXT, { surname: "Painter" });
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({
      kind: "supplied",
      title: "Test Painter — in her own words — Blue Field 2019",
      publisher: "Test Painter (the artist)",
      link: null,
      passage: "I painted *Blue Field* over one winter in a cold studio. The blue is the blue of the bay in July, which I wanted to keep.",
    });
    expect(sources[1].passage).toMatch(/^This work began as a drawing of the harbour wall\./);
    expect(JSON.stringify(sources)).not.toContain("source metadata");
    expect(JSON.stringify(sources)).not.toContain("sent by email");
    expect(suppliedSources(null, { surname: "Painter" })).toEqual([]);
  });
});

describe("the sources allowlist", () => {
  const real = loadAllowlist(path.join(root, "docs", "drafting", "sources-allowlist.md"));

  it("is a short list of domains Michael can edit — galleries, museums, SAHO, the art press; no auction house", () => {
    expect(real.length).toBeGreaterThanOrEqual(30);
    expect(real.length).toBeLessThanOrEqual(MAX_SITES);
    for (const s of real) expect(isDomain(s.domain), s.domain).toBe(true);
    expect(real.find((s) => s.domain === "whatiftheworld.com")?.name).toBe("WHATIFTHEWORLD");
    expect(real.map((s) => s.domain)).toEqual(expect.arrayContaining(["goodman-gallery.com", "stevenson.info", "sahistory.org.za", "artthrob.co.za", "tate.org.uk"]));
    expect(real.map((s) => s.domain).join(" ")).not.toMatch(/strauss|aspire|sothebys|christies|artsy|artnet/);
  });

  it("reads `- domain — name` lines and ignores the rest; a pasted address is reduced to its domain", () => {
    const sites = parseAllowlist(`# Title\n\n_prose_\n- example.com — Example\n- https://www.second.example.org/about — Second\n- not a domain\n- localhost\n- example.com — twice\n- third.co.za\n`);
    expect(sites).toEqual([
      { domain: "example.com", name: "Example" },
      { domain: "second.example.org", name: "Second" },
      { domain: "third.co.za", name: "third.co.za" },
    ]);
    expect(() => parseAllowlist(Array.from({ length: 65 }, (_, i) => `- site${i}.example.com — s`).join("\n"))).toThrow(/at most 64/);
  });

  it("knows which site an address belongs to — subdomains yes, look-alikes no", () => {
    const sites = [{ domain: "goodman-gallery.com", name: "Goodman Gallery" }];
    expect(siteFor("https://www.goodman-gallery.com/artists/x", sites)?.name).toBe("Goodman Gallery");
    expect(siteFor("https://goodman-gallery.com/", sites)?.name).toBe("Goodman Gallery");
    expect(siteFor("https://goodman-gallery.com.evil.example/", sites)).toBeNull();
    expect(siteFor("https://evilgoodman-gallery.com/", sites)).toBeNull();
    expect(siteFor("not an address", sites)).toBeNull();
  });

  it("checks that each domain resolves and reports the ones that do not", async () => {
    const sites = [{ domain: "a.example", name: "A" }, { domain: "b.example", name: "B" }];
    const r = await resolving(sites, async (host) => {
      if (host === "b.example") throw new Error("ENOTFOUND");
      return {};
    });
    expect(r.ok.map((s) => s.domain)).toEqual(["a.example"]);
    expect(r.failed.map((s) => s.domain)).toEqual(["b.example"]);
  });
});
