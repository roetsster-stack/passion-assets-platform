/**
 * M2-04 · The rule checker — plain code, no model, fully tested. It reads a sentence with its
 * sources and says which rule it breaks, if any. What it knows:
 *
 * - Money and the value words (rule 2), the ranking words (rule 6) and, for a living person, the
 *   private-life words (rule 8) are allowed only inside a quotation that passes the exact-match
 *   test and whose source is named in the sentence. A paraphrase never carries them.
 * - The exact-match test (rule 7, and rule 6 as Michael wrote it): the quoted words must appear in
 *   the passage of a cited source — curly or straight quotes, spacing, dashes and markdown emphasis
 *   aside, letter for letter otherwise, capitals included. A quotation that fails is "not a quotation".
 * - A quotation must name its source in the same sentence (rule 3: "quoted … and attributed").
 * - Every sentence cites at least one source that exists (rule 4) — except the one sentence the
 *   list itself allows, "Not enough is known yet." (rule 10).
 * - Nothing about where a work is, who owns it, what it is insured for or its condition (rule 5);
 *   no first person outside a quotation (rule 7: no invented voices).
 * - Length (rule 10): one sentence of at most thirty words for "why they matter"; at most 120 words
 *   for a biography. Sentences beyond the limit leave from the end.
 */
import { NOT_ENOUGH, type Field, type Removal, type Sentence, type Source } from "./types";

export const LIMITS: Record<Field, { words: number; sentences: number | null }> = {
  biography: { words: 120, sentences: null },
  why_they_matter: { words: 30, sentences: 1 },
};

export type Violation = { rule: number; why: string; match: string };
type Span = { text: string; start: number; end: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrases = (list: string[]) => new RegExp(`(?<![\\w-])(?:${list.map((w) => escape(w).replace(/ /g, "\\s+")).join("|")})(?![\\w-])`, "gi");

export const MONEY_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /[R$£€¥]\s?\d/g, why: "a sum of money" },
  { re: /(?<![\w])(?:ZAR|USD|GBP|EUR|JPY|CHF)(?![\w])/g, why: "a currency" },
  { re: /(?<![\w])(?:rands?|dollars?|pounds? sterling|euros?)(?![\w])/gi, why: "a currency" },
  { re: /(?<![\w])\d[\d,.]*\s?(?:million|billion|thousand)(?![\w])/gi, why: "a large number" },
];

/** Rule 2: the words of the market. */
export const VALUE_WORDS = [
  "price", "prices", "priced", "pricing", "estimate", "estimates", "estimated at", "auction", "auctions", "auctioned", "auctioneer",
  "market", "markets", "marketplace", "investment", "investments", "invest", "invested", "investing", "investor", "investors",
  "blue-chip", "blue chip", "sought-after", "sought after", "appreciating", "appreciation", "appreciated in value", "valuation",
  "valuations", "valued at", "worth", "resale", "sold for", "fetched", "hammer", "record price", "record sum", "record sale",
  "collectible", "collectable", "asset", "assets", "lucrative", "expensive",
];

/** Rule 6: rank and superlative, as the list names them and their kin. */
export const RANK_WORDS = [
  "the most", "one of the most", "among the most", "some of the most", "seminal", "major", "leading", "foremost", "greatest",
  "finest", "best", "best-known", "pre-eminent", "preeminent", "iconic", "legendary", "renowned", "celebrated", "acclaimed",
  "critically acclaimed", "world-class", "masterpiece", "masterpieces", "groundbreaking", "ground-breaking", "pioneering",
  "pioneer", "pioneers", "visionary", "genius", "unrivalled", "unrivaled", "unparalleled", "definitive", "canonical", "towering",
  "important", "significant", "influential", "prominent", "key figure", "internationally recognised", "internationally recognized",
  "widely regarded", "widely considered", "famous", "famed",
];

/** Rule 5: the sensitive classes — never given to the desk, and never to appear. */
export const SENSITIVE_WORDS = [
  "insured", "insurance", "insurer", "condition report", "in good condition", "in poor condition", "in fair condition",
  "in excellent condition", "stored", "storage", "hangs in", "hangs at", "hanging in", "kept in", "kept at", "located in",
  "located at", "on loan from", "owned by", "owner", "owners", "ownership", "belongs to", "private collection", "the collector",
  "collector's", "collectors'", "collector’s", "collectors’",
];

/** Rule 8: a living person's private life, beyond what they published themselves. */
export const PRIVATE_WORDS = [
  "married", "marriage", "wife", "husband", "divorce", "divorced", "girlfriend", "boyfriend", "children", "his son", "her son",
  "his daughter", "her daughter", "pregnant", "pregnancy", "illness", "ill health", "cancer", "diagnosed", "diagnosis",
  "depression", "addiction", "rehab", "sober", "bankrupt", "bankruptcy", "debt", "debts", "lawsuit", "sued", "arrested",
  "convicted", "affair", "salary", "earns", "income", "net worth",
];

/** Rule 7: the first person, which is never the desk's. ("us" lower-case only: the US is a place.) */
const VOICE = /(?<![\w'’])(?:I|I'm|I’m|I've|I’ve|my|My|mine|myself|we|We|our|Our|ours|us)(?![\w])/g;

const VALUE = phrases(VALUE_WORDS);
const RANK = phrases(RANK_WORDS);
const SENSITIVE = phrases(SENSITIVE_WORDS);
const PRIVATE = phrases(PRIVATE_WORDS);

/** Curly or straight quotes, spacing, dashes and markdown emphasis aside — letter for letter otherwise. */
export function normalise(text: string): string {
  return text
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛‹›]/g, "'")
    .replace(/[–—‒―]/g, "-")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The quoted spans of a sentence: double quotes anywhere; single quotes only when they stand as quotation marks, not apostrophes. */
export function quotationsIn(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(/[“"]([^“”"]{2,}?)[”"]/g)) spans.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(/(?<![\w])[‘']([^‘’'\n]{2,}?)[’'](?![\w])/g)) {
    if (!spans.some((s) => m.index < s.end && m.index + m[0].length > s.start)) spans.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }
  return spans.sort((a, b) => a.start - b.start);
}

const NOT_A_NAME = new Set([
  "the", "and", "of", "for", "artist", "artists", "gallery", "galleries", "museum", "museums", "foundation", "magazine", "press",
  "page", "website", "online", "biography", "about", "art", "arts", "contemporary", "modern", "south", "african", "africa",
  "american", "british", "national", "international", "institute", "centre", "center", "university", "college", "school",
  "journal", "review", "news", "newspaper", "daily", "weekly", "times", "com", "org", "www",
]);

/** The words by which a source may be named in a sentence: its publisher, or any distinctive word of it. */
export function namesOf(publisher: string): string[] {
  const whole = publisher.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const tokens = (whole.match(/[\p{L}][\p{L}'’-]{2,}/gu) ?? []).filter((t) => !NOT_A_NAME.has(t.toLowerCase()));
  return [...new Set([whole, ...tokens].filter((t) => t.length >= 3))];
}

/** Does the text (outside its quotations) name this source? */
export function attributes(textOutsideQuotes: string, source: Pick<Source, "publisher">): boolean {
  return namesOf(source.publisher).some((name) => new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "iu").test(textOutsideQuotes));
}

const blank = (text: string, spans: Span[]) => spans.reduce((t, s) => t.slice(0, s.start) + " ".repeat(s.end - s.start) + t.slice(s.end), text);

function hits(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => m[0]);
}

/** `neverName`: words that must not appear at all — the collection's owner (rule 5: who owns it). */
export type Context = { living: boolean; neverName?: string[] };

/** The violations of one sentence against the list — an empty list means it may stay. */
export function checkSentence(s: Sentence, sources: Source[], ctx: Context): Violation[] {
  const v: Violation[] = [];
  const text = s.text.trim();
  if (text === NOT_ENOUGH) return v;

  const cited = s.sources.map((n) => sources.find((x) => x.n === n)).filter((x): x is Source => !!x);
  if (cited.length === 0) v.push({ rule: 4, why: "no source a person can check", match: "" });

  // The quotations: verbatim in a cited passage, and attributed in the sentence — or not a quotation.
  const quotes = quotationsIn(text);
  const outsideAll = blank(text, quotes);
  const attributed: Span[] = [];
  for (const q of quotes) {
    const needle = normalise(q.text);
    const owner = cited.find((src) => normalise(src.passage).includes(needle));
    if (!owner) {
      v.push({ rule: 7, why: "a quotation that is not verbatim in any cited source", match: q.text });
      continue;
    }
    if (!attributes(outsideAll, owner)) {
      v.push({ rule: 3, why: `a quotation whose source (${owner.publisher}) is not named in the sentence`, match: q.text });
      continue;
    }
    attributed.push(q);
  }

  // Outside an attributed verbatim quotation, the forbidden words are the desk's own.
  const own = blank(text, attributed);
  for (const p of MONEY_PATTERNS) for (const m of hits(p.re, own)) v.push({ rule: 2, why: p.why, match: m });
  for (const m of hits(VALUE, own)) v.push({ rule: 2, why: "a word of the market", match: m });
  for (const m of hits(RANK, own)) v.push({ rule: 6, why: "a rank or superlative of our own", match: m });
  for (const m of hits(SENSITIVE, own)) v.push({ rule: 5, why: "a sensitive class: location, ownership, insurance or condition", match: m });
  for (const m of hits(VOICE, own)) v.push({ rule: 7, why: "the first person outside a quotation", match: m });
  if (ctx.living) for (const m of hits(PRIVATE, own)) v.push({ rule: 8, why: "a living person's private life", match: m });
  for (const name of ctx.neverName ?? []) {
    if (name.length >= 3 && new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "iu").test(text)) v.push({ rule: 5, why: "names the collection or its owner", match: name });
  }

  return v;
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The sentences that may stay, in order, and what left and why. */
export function checkField(field: Field, sentences: Sentence[], sources: Source[], ctx: Context): { kept: Sentence[]; removed: Removal[] } {
  const kept: Sentence[] = [];
  const removed: Removal[] = [];
  for (const s of sentences) {
    const vs = checkSentence(s, sources, ctx);
    if (vs.length === 0) kept.push(s);
    else removed.push({ text: s.text, rule: vs[0].rule, why: vs.map((x) => `rule ${x.rule}: ${x.why}${x.match ? ` (“${x.match}”)` : ""}`).join("; ") });
  }
  const limit = LIMITS[field];
  if (limit.sentences !== null) {
    while (kept.length > limit.sentences) {
      const extra = kept.pop()!;
      removed.push({ text: extra.text, rule: "length", why: `${field === "why_they_matter" ? "why they matter" : field} is one sentence` });
    }
  }
  while (kept.length > 0 && wordCount(kept.map((s) => s.text).join(" ")) > limit.words) {
    const extra = kept.pop()!;
    removed.push({ text: extra.text, rule: "length", why: `over ${limit.words} words` });
  }
  return { kept, removed };
}
