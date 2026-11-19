/**
 * M2-01 · An artist's approved texts, as every reader sees them beside the work: why they matter,
 * the biography, and the Sources line in the manner of a catalogue's *Literature* — each source
 * with the date the desk read it ("read 19 Nov 2026"), so a reader can judge for themselves whether
 * a page may since have changed (Michael, 18 Nov). Read through the viewer's own session from the
 * `approved_texts` view, so the database decides: approved texts and their sources, nothing else of
 * a draft.
 */
import type { Field, Sentence, Source } from "@/lib/drafting/types";

export type ApprovedText = {
  id: string;
  field: Field;
  text: string;
  sentences: Sentence[];
  sources: Source[];
  /** When the owner approved it, ISO. */
  decidedAt: string;
  /** When the desk wrote it, ISO — the read date of a source that carries none of its own. */
  createdAt: string;
};

export type ArtistTexts = { whyTheyMatter: ApprovedText | null; biography: ApprovedText | null };
export const NO_TEXTS: ArtistTexts = { whyTheyMatter: null, biography: null };

export const APPROVED_COLUMNS = "id, artist_id, field, text, sentences, sources, decided_at, created_at";

const isSentence = (x: unknown): x is Sentence =>
  !!x && typeof x === "object" && typeof (x as Sentence).text === "string" && Array.isArray((x as Sentence).sources) && (x as Sentence).sources.every((n) => Number.isInteger(n));
const isSource = (x: unknown): x is Source =>
  !!x &&
  typeof x === "object" &&
  Number.isInteger((x as Source).n) &&
  typeof (x as Source).title === "string" &&
  typeof (x as Source).publisher === "string" &&
  ((x as Source).link === null || typeof (x as Source).link === "string") &&
  typeof (x as Source).passage === "string";

/** A row of the view as a text the page can show — or nothing, when its shape does not hold. */
export function toApprovedText(row: unknown): ApprovedText | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || (r.field !== "biography" && r.field !== "why_they_matter") || typeof r.text !== "string" || !r.text.trim()) return null;
  if (!Array.isArray(r.sentences) || !r.sentences.every(isSentence) || !Array.isArray(r.sources) || !r.sources.every(isSource)) return null;
  if (typeof r.decided_at !== "string" || typeof r.created_at !== "string") return null;
  // links a browser may follow: http(s) only — anything else is shown unlinked
  const sources = (r.sources as Source[]).map((s) => ({ ...s, link: s.link && /^https?:\/\//i.test(s.link) ? s.link : null }));
  return { id: r.id, field: r.field, text: r.text, sentences: r.sentences as Sentence[], sources, decidedAt: r.decided_at, createdAt: r.created_at };
}

/** The sources a text's sentences cite, in number order — the Sources line lists these and no more. */
export function citedSources(t: Pick<ApprovedText, "sentences" | "sources">): Source[] {
  const cited = new Set(t.sentences.flatMap((s) => s.sources));
  return [...t.sources].filter((s) => cited.has(s.n)).sort((a, b) => a.n - b.n);
}

/** "19 Nov 2026" — the day, in the house's short form, from an ISO date. */
export function dayOf(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "read 19 Nov 2026": the date the desk read a source — its own, or failing that the draft's. */
export function readOn(source: Pick<Source, "readAt">, draftCreatedAt: string): string | null {
  const day = dayOf(source.readAt ?? draftCreatedAt);
  return day ? `read ${day}` : null;
}

/** "the artist's own words" for a supplied text; otherwise the publisher as the allowlist names it. */
export const publisherOf = (s: Pick<Source, "kind" | "publisher">) => (s.kind === "supplied" ? `${s.publisher}, in their own words` : s.publisher);

export function toArtistTexts(rows: unknown[]): ArtistTexts {
  const texts = rows.map(toApprovedText).filter((t): t is ApprovedText => !!t);
  return {
    whyTheyMatter: texts.find((t) => t.field === "why_they_matter") ?? null,
    biography: texts.find((t) => t.field === "biography") ?? null,
  };
}

/** A sentence's text as segments for the screen: the desk writes a work's title in *italics*. */
export type Segment = { text: string; italic: boolean };
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*([^*\n]+)\*/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index), italic: false });
    out.push({ text: m[1], italic: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), italic: false });
  return out;
}

/** A text's sentences with their source numbers mapped onto one shared list. */
export type Shown = { id: string; field: Field; sentences: Sentence[]; createdAt: string };

/**
 * Why they matter and the biography are separate drafts, each numbering its own sources; on the
 * work they share one Sources line. The sources either text cites, each once, numbered afresh in
 * the order they are first cited — and each text's sentences renumbered to match.
 */
export function combine(texts: ApprovedText[]): { sources: Source[]; shown: Shown[] } {
  const key = (s: Source) => `${s.kind}|${s.link ?? ""}|${s.title}|${s.publisher}|${s.passage}`;
  const numbers = new Map<string, number>();
  const sources: Source[] = [];
  const shown: Shown[] = [];
  for (const t of texts) {
    const byN = new Map(t.sources.map((s) => [s.n, s]));
    const sentences = t.sentences.map((s) => {
      const mapped = s.sources.flatMap((n) => {
        const src = byN.get(n);
        if (!src) return [];
        const k = key(src);
        if (!numbers.has(k)) {
          numbers.set(k, sources.length + 1);
          sources.push({ ...src, n: sources.length + 1, readAt: src.readAt ?? t.createdAt });
        }
        return [numbers.get(k)!];
      });
      return { text: s.text, sources: [...new Set(mapped)].sort((a, b) => a - b) };
    });
    shown.push({ id: t.id, field: t.field, sentences, createdAt: t.createdAt });
  }
  return { sources, shown };
}
