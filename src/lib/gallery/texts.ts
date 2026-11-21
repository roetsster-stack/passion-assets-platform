/**
 * M2-01 · An artist's approved texts, as every reader sees them beside the work: why they matter,
 * the biography, and the Sources line in the manner of a catalogue's *Literature* — each source
 * with the date the desk read it ("read 19 Nov 2026"), so a reader can judge for themselves whether
 * a page may since have changed (Michael, 18 Nov). Read through the viewer's own session from the
 * `approved_texts` view, so the database decides: approved texts and their sources, nothing else of
 * a draft.
 */
import { NOT_ENOUGH, type Field, type Sentence, type Source } from "@/lib/drafting/types";

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
  // the list's own sentence is an answer, not a text: never shown beside a work (the review of PR #14, should-fix 1)
  if (r.text.trim() === NOT_ENOUGH) return null;
  if (!Array.isArray(r.sentences) || !r.sentences.every(isSentence) || !Array.isArray(r.sources) || !r.sources.every(isSource)) return null;
  if (typeof r.decided_at !== "string" || typeof r.created_at !== "string") return null;
  const sources = (r.sources as Source[]).map((s) => ({ ...s, link: safeLink(s.link) }));
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
export function readOn(source: Pick<Source, "readAt"> & Partial<Pick<Source, "kind">>, draftCreatedAt: string): string | null {
  // a book carries no read date: it does not change, and its page is its address (M2-04c)
  if (source.kind === "book") return null;
  const day = dayOf(source.readAt ?? draftCreatedAt);
  return day ? `read ${day}` : null;
}

/** A link a browser may follow: http(s) only — anything else is shown unlinked, for the owner and for readers alike. */
export const safeLink = (link: string | null | undefined): string | null => (link && /^https?:\/\//i.test(link) ? link : null);

const ARTIST_MARKER = /\s*\(the artist\)\s*$/i;

/**
 * Who stands behind a source, as a reader should see it: the publisher as the allowlist names it; for a
 * supplied text whose author line carries the desk's "(the artist)" marker, "the artist's own words" —
 * the marker itself is the desk's and is never shown (the review of PR #14).
 */
export const publisherOf = (s: Pick<Source, "kind" | "publisher">): string =>
  s.kind === "supplied" || s.kind === "book" ? (ARTIST_MARKER.test(s.publisher) ? "the artist's own words" : s.publisher.replace(ARTIST_MARKER, "")) : s.publisher;

/** "Title, Publisher" — or the title alone where it already says whose words they are ("Dan Halter — in his own words"). */
export function sourceLabel(s: Pick<Source, "kind" | "title" | "publisher">): string {
  // a book is named as a catalogue's Literature names it, and the citation already says whose book it is (M2-04c)
  if (s.kind === "book") return s.title;
  const who = publisherOf(s);
  if (who === "the artist's own words" && /own words/i.test(s.title)) return s.title;
  return who ? `${s.title}, ${who}` : s.title;
}

/**
 * A page's own name from its passages' titles: the desk writes a supplied passage's title as
 * "<file title> — <heading>", so the name is the title a heading-less passage carries, or failing that
 * the common stem before the last " — "; a lone title is kept whole.
 */
export function commonTitle(titles: string[]): string {
  if (titles.length === 0) return "";
  let prefix = titles[0];
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++;
    prefix = prefix.slice(0, i);
  }
  if (titles.some((t) => t === prefix)) return prefix;
  const cut = prefix.lastIndexOf(" — ");
  return cut > 0 ? prefix.slice(0, cut) : titles.reduce((a, b) => (b.length < a.length ? b : a));
}

/** One page, not one passage: a web source by its link (failing that its title and publisher), a supplied text by its author. */
export const pageKey = (s: Pick<Source, "kind" | "link" | "title" | "publisher">): string =>
  s.kind === "book" ? `book|${s.title}` : s.kind === "supplied" ? `supplied|${s.publisher}` : `web|${s.link ?? `${s.title}|${s.publisher}`}`;

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
 * Why they matter and the biography are separate drafts, each numbering its own sources — one
 * number per passage; on the work they share one Sources line, in the manner of a catalogue's
 * *Literature*: one entry per page, however many passages were quoted from it (the review of
 * PR #14, should-fix 2). The pages either text cites, each once, numbered afresh in the order they
 * are first cited — and each text's sentences renumbered to match, a sentence resting on two
 * passages of one page carrying that page's one number.
 */
export function combine(texts: ApprovedText[]): { sources: Source[]; shown: Shown[] } {
  const numbers = new Map<string, number>();
  const pages: { source: Source; titles: string[] }[] = [];
  const shown: Shown[] = [];
  for (const t of texts) {
    const byN = new Map(t.sources.map((s) => [s.n, s]));
    const sentences = t.sentences.map((s) => {
      const mapped = s.sources.flatMap((n) => {
        const src = byN.get(n);
        if (!src) return [];
        const k = pageKey(src);
        if (!numbers.has(k)) {
          numbers.set(k, pages.length + 1);
          // every passage of the page the text carries, cited or not, names the page
          pages.push({ source: { ...src, n: pages.length + 1, readAt: src.kind === "book" ? undefined : (src.readAt ?? t.createdAt) }, titles: t.sources.filter((x) => pageKey(x) === k).map((x) => x.title) });
        }
        return [numbers.get(k)!];
      });
      return { text: s.text, sources: [...new Set(mapped)].sort((a, b) => a - b) };
    });
    shown.push({ id: t.id, field: t.field, sentences, createdAt: t.createdAt });
  }
  const sources = pages.map((p) => ({ ...p.source, title: commonTitle(p.titles) || p.source.title }));
  return { sources, shown };
}
