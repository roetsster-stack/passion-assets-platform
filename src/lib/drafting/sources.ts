/**
 * M2-04 · Supplied texts — what Michael supplies first, before any search: the artist's own
 * statement, a catalogue note. Read from <CURATOR_CONTEXT_DIR>/artists/<Surname>_<Given>.md on
 * Workshop, never from the repository (CI uses hand-written fixtures). A file is a title, a few
 * metadata bullets (**Author:**, **Document:**), a `---`, then the text; every paragraph becomes
 * one passage the model can cite and the checker can match quotations against. The title the model
 * sees is the file's own heading ("Dan Halter — in his own words"); the Document line, which may
 * name the collector, stays in the file.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArtistInput, Source } from "./types";

export type Passage = { heading: string | null; text: string };
export type SuppliedText = { file: string; title: string; document: string | null; publisher: string; passages: Passage[] };

/** Letters and digits only, no case, no diacritics: "Naudé" and "Naude" are the same name. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function parseSuppliedText(markdown: string, file: string): SuppliedText {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const h1 = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim() ?? null;
  const meta = (key: string) => {
    const m = lines.map((l) => l.match(new RegExp(`^-\\s+\\*\\*${key}:\\*\\*\\s*(.+)$`, "i"))).find(Boolean);
    return m ? m[1].trim().replace(/\.$/, "") : null;
  };
  const document = meta("Document");
  const author = meta("Author");
  const rule = lines.findIndex((l) => /^---+\s*$/.test(l));
  const body = rule >= 0 ? lines.slice(rule + 1) : lines.filter((l) => !/^#\s+/.test(l) && !/^-\s+\*\*/.test(l));

  const passages: Passage[] = [];
  let heading: string | null = null;
  let current: string[] = [];
  const flush = () => {
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    if (text) passages.push({ heading, text });
    current = [];
  };
  for (const line of body) {
    if (/^\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^#{1,6}\s+/.test(line) || /^\*\*\*.+\*\*\*/.test(line)) {
      flush();
      heading = line.replace(/^#{1,6}\s+/, "").replace(/\*/g, "").trim();
      continue;
    }
    current.push(line.trim());
  }
  flush();

  return {
    file,
    title: h1 ?? path.basename(file, ".md"),
    document,
    publisher: author ?? "supplied text",
    passages,
  };
}

/** The files for an artist: `<Surname>_….md` under `<dir>/artists/`, matched without case or diacritics. */
export function suppliedFilesFor(contextDir: string, artist: Pick<ArtistInput, "surname">): string[] {
  const dir = path.join(contextDir, "artists");
  if (!existsSync(dir)) return [];
  const key = fold(artist.surname);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => {
      const stem = fold(f.replace(/\.md$/, "").split("_")[0] ?? "");
      return stem === key;
    })
    .sort()
    .map((f) => path.join(dir, f));
}

/** The supplied passages for an artist as sources, unnumbered: the desk numbers them first. */
export function suppliedSources(contextDir: string | null, artist: Pick<ArtistInput, "surname">): Omit<Source, "n">[] {
  if (!contextDir) return [];
  const out: Omit<Source, "n">[] = [];
  for (const file of suppliedFilesFor(contextDir, artist)) {
    const t = parseSuppliedText(readFileSync(file, "utf8"), file);
    for (const p of t.passages) {
      out.push({ kind: "supplied", title: p.heading ? `${t.title} — ${p.heading}` : t.title, publisher: t.publisher, link: null, passage: p.text });
    }
  }
  return out;
}
