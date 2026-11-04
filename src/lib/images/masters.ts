/**
 * The masters folders on Workshop — the pure rules. One folder per work under ~/curator/masters/,
 * named `NNN-Surname-Title` (alphabetical by artist, then year; a number, once given, never
 * changes), with a hidden marker holding the work's Airtable record id. The photographer's and the
 * galleries' files are matched to works by the surname and the title in their filenames.
 *
 * Compatible with the folders `tools/prepare_masters.js` made on 3 Nov 2026: same names, same marker.
 */

export const MARKER = ".curator-work.json";

/** A work folder's name: three digits, a dash, the rest. */
export const WORK_FOLDER = /^\d{3}-/;

/** What the command takes in: the formats sharp reads. Anything else in a folder is reported, never taken. */
export const MASTER_TYPES: Record<string, string> = {
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
};

/** Files a sorter recognises as pictures (some of which, like a RAW or a zip, a person must convert first). */
export const PICTURE_LIKE = new Set([...Object.keys(MASTER_TYPES), ".dng", ".cr2", ".cr3", ".arw", ".nef", ".psd", ".zip"]);

export type MasterWork = {
  recordId: string;
  artist: string;
  surname: string;
  title: string;
  /** The year as entered ("2010", "Circa 1980's"). */
  year: string;
};

export type Marker = MasterWork & { folder: string };

function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase();
}

function ascii(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** `003-Adams-Untitled-ii-Arabic-frame-purple`: the number, the surname as one word, the title's first eight words. */
export function folderName(n: number, surname: string, title: string): string {
  const sur = ascii(surname).replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "") || "Unknown";
  const words = ascii(title)
    .replace(/['’-]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 8);
  return [String(n).padStart(3, "0"), sur, ...(words.length ? words : ["Untitled"])].join("-");
}

const byText = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** The hanging order of the folders: by surname, then year, then title. */
export function folderOrder(a: MasterWork, b: MasterWork): number {
  return byText.compare(a.surname, b.surname) || byText.compare(yearOf(a) ?? "9999", yearOf(b) ?? "9999") || byText.compare(a.title, b.title) || a.recordId.localeCompare(b.recordId);
}

/**
 * Folders for works that have none: existing folders keep their names and numbers; new works are
 * numbered after the highest number in use, in hanging order.
 */
export function planFolders(works: MasterWork[], existing: Map<string, string>): { work: MasterWork; folder: string; isNew: boolean }[] {
  let next = 1 + Math.max(0, ...[...existing.values()].map((f) => Number(/^(\d+)-/.exec(f)?.[1] ?? 0)));
  return [...works].sort(folderOrder).map((work) => {
    const have = existing.get(work.recordId);
    if (have) return { work, folder: have, isNew: false };
    return { work, folder: folderName(next++, work.surname, work.title), isNew: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Matching a file to a work, by the words in its name (and the folders it sits in).

const STOP = new Set(
  "the of a an and from after as on in at to or with for de la le jpg jpeg tif tiff png copy final lr hr hires lowres web small s detail part view flat raking insitu situ framed unframed image img dsc scan".split(" "),
);

function tokens(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

/**
 * A surname's words, filtered as a filename's are, so "de Villiers" is looked for as "villiers"
 * (the particle is a stop word in both). Also the surname run together, as a photographer types
 * it: "devilliers", "kazenzile".
 */
function surnameForms(surname: string): { words: string[]; joined: string } {
  const all = fold(surname).split(/[^a-z0-9]+/).filter(Boolean);
  const words = all.filter((t) => !STOP.has(t));
  return { words: words.length ? words : all, joined: all.join("") };
}

function yearOf(w: Pick<MasterWork, "year">): string | null {
  return /(19|20)\d\d/.exec(w.year ?? "")?.[0] ?? null;
}

export type Placement =
  | { status: "match"; work: Marker }
  | { status: "artist-only"; work: Marker }
  | { status: "title-unknown"; work: Marker }
  | { status: "ambiguous"; candidates: Marker[] }
  | { status: "no-artist" };

/**
 * Where a file belongs. `relPath` is the file's path within the folder being sorted (its parent
 * folders count as context for the artist, never for the title).
 *
 *   match          the artist and at least one word of one title — the best title clearly
 *   artist-only    the artist, and nothing in the file's name but their surname, a year or
 *                  numbers; the collection holds one work by them, so it is that one
 *   title-unknown  the artist, whose one work this may or may not be: the name carries words
 *                  that are no title of theirs. Never placed by guess.
 *   ambiguous      the artist, but the title cannot decide between works
 *   no-artist      no surname recognised
 */
export function placeFile(relPath: string, works: Marker[]): Placement {
  const parts = relPath.split(/[\\/]/);
  const base = parts[parts.length - 1].replace(/\.[^.]+$/, "");
  const fileTok = new Set(tokens(base));
  const all = new Set([...fileTok, ...tokens(parts.slice(0, -1).join(" "))]);

  const cands: { w: Marker; score: number; hit: number; sur: { words: string[]; joined: string } }[] = [];
  for (const w of works) {
    const sur = surnameForms(w.surname);
    if (!sur.words.length) continue;
    const surHit = sur.words.every((t) => all.has(t)) || all.has(sur.joined);
    if (!surHit) continue;
    const tt = tokens(w.title);
    const title = tt.length ? tt : ["untitled"];
    const hit = title.filter((t) => fileTok.has(t)).length;
    let score = hit ? hit / title.length : 0;
    const y = yearOf(w);
    if (y && fileTok.has(y)) score += 0.15;
    if (sur.words.every((t) => fileTok.has(t)) || fileTok.has(sur.joined)) score += 0.05;
    cands.push({ w, score, hit, sur });
  }
  if (!cands.length) return { status: "no-artist" };
  cands.sort((a, b) => b.score - a.score);
  const [best, second] = cands;
  const byArtist = cands.filter((c) => c.w.surname === best.w.surname);
  if (byArtist.length === 1) {
    if (best.hit) return { status: "match", work: best.w };
    // Nothing in the name but the surname and numbers (a year, a camera's counter)? Then it is the
    // artist's one work. A word that is not theirs — a title the register does not know — is not.
    const beyond = [...fileTok].filter((t) => !best.sur.words.includes(t) && t !== best.sur.joined && !/^\d+$/.test(t));
    return beyond.length ? { status: "title-unknown", work: best.w } : { status: "artist-only", work: best.w };
  }
  if (best.hit && (!second || best.score > second.score + 0.001) && best.score >= 0.3) return { status: "match", work: best.w };
  return { status: "ambiguous", candidates: cands.slice(0, 3).map((c) => c.w) };
}
