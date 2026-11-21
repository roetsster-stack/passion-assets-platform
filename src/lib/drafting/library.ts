/**
 * M2-04c · Books as sources — the passages Michael chose from the books he owns, in their authors'
 * words, cited the way a catalogue cites literature: "Williamson, *South African Art Now* (2009), p. 164".
 *
 * Read from <CURATOR_CONTEXT_DIR>/library/<book-key>/ on Workshop, never from the repository (CI uses a
 * hand-written fixture book). A book's folder holds `book.md`, its citation, and one file of extracts per
 * artist, in the supplied-text format: a title, metadata bullets (**Author:**, **Status:**), a `---`, then the
 * passages under `## ` headings that give their page. The desk reads only a file whose status begins
 * CHECKED (read against the page by a person or an agent), never a passage holding a `[?]` (a word nobody
 * could read with certainty), never a passage whose heading gives no page, and never a note left by
 * the person who checked it (a line in _underscores_). The scans in `inbox/` are never read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fold, parseSuppliedText } from "./sources";
import type { ArtistInput, Source } from "./types";

export type Book = {
  /** The Literature form without its page: "Williamson, *South African Art Now* (2009)". */
  short: string;
  /** The whole citation for the owner's screen: "Sue Williamson, *South African Art Now* (Collins Design, …, 2009)". */
  full: string;
};

const bullet = (lines: string[], key: string): string | null => {
  const re = new RegExp(`^-\\s+\\*\\*${key}:\\*\\*\\s*(.+)$`, "i");
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1].trim();
  }
  return null;
};

/**
 * The first clause of a metadata line: "Sue Williamson. Appreciation by …" → "Sue Williamson". An initial stays
 * ("Courtney J. Martin"), and so does anything in parentheses ("Stevenson (ed. Sophie Perryer)").
 */
export function clause(s: string): string {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ";") return s.slice(0, i).trim();
    else if (depth === 0 && c === "." && (i + 1 === s.length || /\s/.test(s[i + 1])) && !/(^|\s)[A-Z]$/.test(s.slice(0, i))) return s.slice(0, i).trim();
  }
  return s.trim();
}

/** A book's citation from its `book.md`; null when it carries no Literature form (nothing to cite it by). */
export function parseBook(markdown: string): Book | null {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const literature = bullet(lines, "Literature form");
  if (!literature) return null;
  const short = literature.replace(/,?\s*pp?\.\s*n\.?\s*$/i, "").trim();
  if (!short) return null;
  const firstClause = (v: string | null) => (v ? clause(v) : null);
  const h1 = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim() || null;
  const titleLine = bullet(lines, "Title");
  const title = titleLine?.match(/\*[^*]+\*/)?.[0] ?? titleLine ?? (h1 ? `*${h1}*` : null);
  const who = firstClause(bullet(lines, "Author")) ?? firstClause(bullet(lines, "Artist"));
  const editor = bullet(lines, "Editor")?.split(/\s+·\s+|\s\(/)[0].trim() || null;
  const publisher = firstClause(bullet(lines, "Publisher"))?.split(/\s\(|, for |, in association/)[0].trim() || null;
  const year = bullet(lines, "Year")?.match(/\d{4}/)?.[0] ?? null;
  const tail = [publisher, year].filter(Boolean).join(", ");
  const head = who ? [who, title, editor ? `ed. ${editor}` : null] : [editor ? `${editor} (ed.)` : null, title];
  const full = head.filter(Boolean).join(", ") + (tail ? ` (${tail})` : "");
  return { short, full: full || short };
}

/** The page a passage's heading gives — "p. 164", "pp. 9–39" — or null: a passage with no page is not cited. */
export function pageOf(heading: string | null): string | null {
  const m = heading?.match(/\b(pp?)\.\s*(\d+(?:\s*[–-]\s*\d+)?)/i);
  if (!m) return null;
  const range = m[2].replace(/\s*[–-]\s*/, "–");
  return `${range.includes("–") ? "pp." : "p."} ${range}`;
}

/** Only a file someone has read against the page: its Status line begins CHECKED. */
export function isChecked(markdown: string): boolean {
  const status = bullet(markdown.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/), "Status");
  return !!status && /^checked\b/i.test(status);
}

/** The book folders under `<dir>/library/`: every folder holding a `book.md`, never the inbox or a working folder. */
function bookDirs(contextDir: string): string[] {
  const dir = path.join(contextDir, "library");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => d !== "inbox" && !d.startsWith("_") && !d.startsWith("."))
    .map((d) => path.join(dir, d))
    .filter((d) => statSync(d).isDirectory() && existsSync(path.join(d, "book.md")))
    .sort();
}

/** An artist's extract files across the library: `<Surname>_….md`, matched without case or diacritics, as supplied texts are. */
export function libraryFilesFor(contextDir: string, artist: Pick<ArtistInput, "surname">): string[] {
  const key = fold(artist.surname);
  return bookDirs(contextDir).flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith(".md") && f !== "book.md")
      .filter((f) => fold(f.replace(/\.md$/, "").split("_")[0] ?? "") === key)
      .sort()
      .map((f) => path.join(d, f)),
  );
}

/** "Penny Siopis" wrote this file of extracts, and she is the artist: her own published words (the first voice). */
const byTheArtist = (author: string, artist: Pick<ArtistInput, "surname">): boolean =>
  !/not the artist/i.test(author) && fold(author).includes(fold(artist.surname));

/** The book passages for an artist as sources, unnumbered — after the supplied texts, before the web. */
export function librarySources(contextDir: string | null, artist: Pick<ArtistInput, "surname">): Omit<Source, "n">[] {
  if (!contextDir) return [];
  const out: Omit<Source, "n">[] = [];
  for (const file of libraryFilesFor(contextDir, artist)) {
    const markdown = readFileSync(file, "utf8");
    if (!isChecked(markdown)) continue;
    const book = parseBook(readFileSync(path.join(path.dirname(file), "book.md"), "utf8"));
    if (!book) continue;
    const t = parseSuppliedText(markdown, file);
    const author = clause(t.publisher === "supplied text" ? "" : t.publisher);
    if (!author) continue;
    const publisher = byTheArtist(author, artist) ? `${author} (the artist)` : author;
    for (const p of t.passages) {
      const page = pageOf(p.heading);
      if (!page) continue;
      if (p.text.includes("[?]")) continue;
      if (/^_[^_].*_$/.test(p.text.trim())) continue;
      out.push({ kind: "book", title: `${book.short}, ${page}`, publisher, link: null, passage: p.text, book: book.full });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The trim: what a reader of an approved text is shown of a book is the sentences the text cites.

const QUOTED = /[“"]([^”"]{3,})[”"]/g;
const words = (s: string) => (s.toLowerCase().match(/[a-zÀ-ɏ']{4,}/g) ?? []).map((w) => w.replace(/'/g, ""));
const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** A passage's sentences, as a reader would count them. */
export function sentencesOf(passage: string): string[] {
  return (passage.match(/[^.!?]+(?:[.!?]+[”"’)]*|$)/g) ?? [passage]).map((s) => s.trim()).filter(Boolean);
}

/**
 * The sentences of a book passage that the draft's sentences citing it rest on: each quotation's sentences,
 * and for a sentence that paraphrases, the one passage sentence sharing the most words with it. A passage
 * no sentence can be traced to stays whole only if it is one sentence long; otherwise its first sentence.
 */
export function trimPassage(passage: string, citing: string[]): string {
  const parts = sentencesOf(passage);
  if (parts.length <= 1) return passage;
  const keep = new Set<number>();
  for (const sentence of citing) {
    const quotes = [...sentence.matchAll(QUOTED)].map((m) => squash(m[1]));
    if (quotes.length) {
      for (const q of quotes) {
        // a quotation may run across sentences: keep every sentence it touches
        const flat = squash(passage);
        const at = flat.indexOf(q);
        if (at < 0) continue;
        let pos = 0;
        parts.forEach((p, i) => {
          const start = flat.indexOf(squash(p), pos);
          const end = start + squash(p).length;
          if (start >= 0) pos = end;
          if (start >= 0 && start < at + q.length && end > at) keep.add(i);
        });
      }
      continue;
    }
    const mine = new Set(words(sentence));
    let best = -1;
    let score = 0;
    parts.forEach((p, i) => {
      const s = words(p).filter((w) => mine.has(w)).length;
      if (s > score) {
        score = s;
        best = i;
      }
    });
    if (best >= 0) keep.add(best);
  }
  if (keep.size === 0) keep.add(0);
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => parts[i])
    .join(" … ");
}
