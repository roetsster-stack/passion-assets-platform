/**
 * M2-04 · The rule checker — plain code, no model, fully tested. It reads a sentence with its
 * sources and says which rule it breaks, if any. Made strict in M2-04b, after the cold review of
 * PR #11. What it knows:
 *
 * - A sum of money, an auction house, a sale or a result (rule 2) and the sensitive classes
 *   (rule 5) may appear nowhere in a sentence — not even inside a quotation.
 * - The words of the market (rule 2) and the ranking words (rule 6) may appear only inside a
 *   quotation that passes the exact-match test and whose source is named in the sentence. A
 *   paraphrase never carries them.
 * - A living person's private life (rule 8) — family, health, relationships, sexuality, finances —
 *   may appear only inside such a quotation from the artist's own text (their supplied statement,
 *   or a passage in which the artist is the one speaking), attributed to the artist. Never a
 *   third party's remarks, quoted or not.
 * - The exact-match test (rule 7, and rule 6 as Michael wrote it): the quoted words must appear in
 *   the passage of a cited source, beginning and ending at a word boundary — curly or straight
 *   quotes, spacing, dashes and markdown emphasis aside, letter for letter otherwise, capitals
 *   included. A quotation that fails is "not a quotation".
 * - A quotation must name its source in the same sentence (rule 3: "quoted … and attributed"): the
 *   publisher, by its whole name or a distinctive word of it — never a common English word; or the
 *   person the passage itself shows speaking those words — a name of two or more words beside a
 *   speech verb ("Hilton Als has written", "according to Hilton Als"), never a place or a prize;
 *   or the artist, as "the artist" or by name, only where the words are the artist's own.
 * - Every sentence cites at least one source that exists (rule 4) — except the one sentence the
 *   list itself allows, "Not enough is known yet." (rule 10).
 * - No first person outside a quotation (rule 7: no invented voices). A work's title in italics is
 *   the work's words, not the desk's: like an attributed quotation it is skipped by the market, rank,
 *   first-person and private-life checks, and like one it still cannot hold a sum, a sale or a
 *   sensitive class.
 * - Length (rule 10, as M2-04b set it): a biography of at most 250 words; why they matter in at
 *   most two sentences and sixty words — real sentences, not entries. Sentences beyond the limit
 *   leave from the end.
 *
 * Facts written in the desk's own words are not checked here: only the second, model-based
 * reading tests a paraphrase against its passage. Plain code checks quotations word for word, the
 * word lists, the sources and the lengths.
 */
import { NOT_ENOUGH, type Field, type Removal, type Sentence, type Source } from "./types";

export const LIMITS: Record<Field, { words: number; sentences: number | null }> = {
  biography: { words: 250, sentences: null },
  why_they_matter: { words: 60, sentences: 2 },
};

export type Violation = { rule: number; why: string; match: string };
type Span = { text: string; start: number; end: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrases = (list: string[]) => new RegExp(`(?<![\\w-])(?:${list.map((w) => escape(w).replace(/ /g, "\\s+")).join("|")})(?![\\w-])`, "gi");

const NUMBER_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|hundreds|thousand|thousands|million|millions|billion|billions|few|several|dozen|dozens|tens|couple)";
/** "2.4m", "50k", "1,200", "3 million". */
const FIGURE = "\\d[\\d,.]*\\s?(?:k|m|bn|mn|million|billion|thousand)?";
/** A figure, or number words: "two million", "tens of thousands", "a few thousand", "multimillion". */
const AMOUNT = `(?:${FIGURE}|(?<![\\w])(?:multi)?${NUMBER_WORD}(?:(?:[-\\s]|\\s+of\\s+)${NUMBER_WORD})*(?:\\s+of)?)`;
const CURRENCY_WORD = "(?:rands?|dollars?|pounds?|euros?|yen|francs?)";

export const MONEY_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /[R$£€¥]\s?\d/g, why: "a sum of money" },
  { re: /(?<![\w])(?:ZAR|USD|GBP|EUR|JPY|CHF)(?![\w])/g, why: "a currency" },
  // a currency word is money when an amount stands beside it ("two million rand", "500 dollars", "2.4m rand",
  // "millions of dollars", "thirty dollars"); a dollar bill in a collage is not
  { re: new RegExp(`${AMOUNT}\\s+(?:\\w+\\s+)?${CURRENCY_WORD}(?![\\w])`, "gi"), why: "a sum of money" },
  // "a million-dollar painting", "multimillion-dollar", "a seven-figure sum"
  { re: new RegExp(`(?<![\\w])(?:(?:multi)?${NUMBER_WORD}|${FIGURE})-(?:dollar|rand|pound|euro|figure)(?![\\w])`, "gi"), why: "a sum of money" },
  { re: /(?<![\w])\d[\d,.]*\s?(?:million|billion|thousand)(?![\w])/gi, why: "a large number" },
];

/** Rule 2: an auction house, a sale or a result — never written, quoted or not. */
export const MARKET_FACTS = [
  "sotheby's", "sotheby’s", "sothebys", "christie's", "christie’s", "christies", "bonhams", "phillips", "strauss & co", "strauss and co",
  "aspire art", "sold at", "sold for", "sold out", "sell out", "sells out", "selling out", "fetched", "under the hammer", "hammer price",
  "record price", "record sum", "record sale", "auction result", "auction results", "auction record", "top lot", "estimated to reach",
  "estimated to fetch", "estimated at", "sale price", "sale", "sales",
];

/** Rule 2: the words of the market — only inside an attributed quotation, never the desk's own. */
export const VALUE_WORDS = [
  "price", "prices", "priced", "pricing", "estimate", "estimates", "auction", "auctions", "auctioned", "auctioneer", "market", "markets",
  "marketplace", "investment", "investments", "invest", "invested", "investing", "investor", "investors", "blue-chip", "blue chip",
  "sought-after", "sought after", "appreciating", "appreciation", "appreciated in value", "valuation", "valuations", "valued at", "value",
  "valuable", "priceless", "worth", "resale", "collectible", "collectable", "asset", "assets", "lucrative", "expensive", "in demand",
  "high demand", "collectors compete",
];

/** Rule 6: rank and superlative, as the list names them and their kin. */
export const RANK_WORDS = [
  "the most", "one of the most", "among the most", "some of the most", "seminal", "major", "leading", "foremost", "greatest", "finest",
  "best", "best-known", "pre-eminent", "preeminent", "eminent", "iconic", "legendary", "renowned", "world-renowned", "world renowned",
  "celebrated", "acclaimed", "critically acclaimed", "internationally acclaimed", "highly acclaimed", "world-class", "masterpiece",
  "masterpieces", "groundbreaking", "ground-breaking", "pioneering", "pioneer", "pioneers", "trailblazing", "trailblazer", "visionary",
  "genius", "unrivalled", "unrivaled", "unparalleled", "unmatched", "peerless", "definitive", "canonical", "towering", "important",
  "significant", "influential", "prominent", "key figure", "internationally recognised", "internationally recognized", "widely regarded",
  "widely considered", "highly regarded", "famous", "famed", "well-known", "well known", "lauded", "hailed", "landmark", "exceptional",
  "remarkable", "extraordinary", "outstanding", "esteemed", "distinguished", "revered", "award-winning", "prize-winning", "rising star",
  "superstar", "household name",
];

/** Rule 6 again: "Africa's most exciting painter", "her most ambitious work" — a possessive before "most"; "most of" is a quantity. */
export const RANK_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /(?<![\w])(?:\p{L}+['’]s|its|her|his|their|our)\s+most\s+(?!of(?![\w])|recent)\p{L}+/giu, why: "a rank or superlative of our own" },
];

/** Rule 5: the sensitive classes — never given to the desk, and never to appear. */
export const SENSITIVE_WORDS = [
  "insured", "insurance", "insurer", "condition report", "in good condition", "in poor condition", "in fair condition",
  "in excellent condition", "stored", "storage", "hangs in", "hangs at", "hanging in", "kept in", "kept at", "located in", "located at",
  "on loan from", "owned by", "owner", "owners", "ownership", "belongs to", "private collection", "private collections", "private collector",
  "private collectors", "the collector", "collector's", "collectors'", "collector’s", "collectors’",
];

/** Rule 8: a living person's private life — family, health, relationships, sexuality, finances — beyond what they published themselves. */
export const PRIVATE_WORDS = [
  "married", "marriage", "wife", "husband", "divorce", "divorced", "girlfriend", "boyfriend", "partner", "children", "son", "sons",
  "his son", "her son", "daughter", "daughters", "his daughter", "her daughter", "father", "mother", "parents", "brother", "brothers",
  "sister", "sisters", "siblings", "family", "grandfather", "grandmother", "uncle", "aunt", "pregnant", "pregnancy", "illness", "ill health",
  "cancer", "diagnosed", "diagnosis", "depression", "addiction", "rehab", "sober", "sexuality", "sexual", "gay", "queer", "lesbian", "bisexual",
  "transgender", "homosexual", "bankrupt", "bankruptcy", "debt", "debts", "lawsuit", "sued", "arrested", "convicted", "affair", "salary",
  "earns", "income", "net worth",
];

/** Rule 7: the first person, which is never the desk's. ("us" lower-case only: the US is a place.) */
const VOICE = /(?<![\w'’])(?:I|I'm|I’m|I've|I’ve|my|My|mine|myself|me|Me|we|We|our|Our|ours|us)(?![\w])/g;

const MARKET = phrases(MARKET_FACTS);
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

/**
 * The quoted spans of a sentence: double quotes anywhere; single quotes only when they stand as
 * quotation marks, not apostrophes — an apostrophe inside a single-quoted span (‘the artist’s finest
 * work’) is one that a letter follows.
 */
export function quotationsIn(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(/[“"]([^“”"]{2,}?)[”"]/g)) spans.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(/(?<![\w])[‘']((?:[^‘’'\n]|[’'](?=\p{L})){2,}?)[’'](?![\w])/gu)) {
    if (!spans.some((s) => m.index < s.end && m.index + m[0].length > s.start)) spans.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** A work's title in italics: *Why Should I Hesitate* — the work's words, never the desk's. */
export function italicsIn(text: string): Span[] {
  return [...text.matchAll(/\*([^*\n]{1,160}?)\*/g)].map((m) => ({ text: m[1], start: m.index, end: m.index + m[0].length }));
}

/** The quotation stands in the passage whole, beginning and ending at a word boundary — "important" is not in "unimportant". */
export function placeOf(passage: string, needle: string): Span | null {
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${escape(needle)}(?![\\p{L}\\p{N}])`, "u").exec(passage);
  return m ? { text: m[0], start: m.index, end: m.index + m[0].length } : null;
}

/** Words that are never a name on their own, nor a name when every word of a run is one of them. */
const NOT_A_NAME = new Set([
  "the", "a", "an", "and", "of", "for", "in", "at", "on", "artist", "artists", "gallery", "galleries", "galerie", "museum", "museums",
  "foundation", "magazine", "press", "page", "website", "online", "biography", "about", "art", "arts", "contemporary", "modern", "south",
  "african", "africa", "american", "british", "national", "international", "institute", "institution", "centre", "center", "university",
  "college", "school", "journal", "review", "news", "newspaper", "daily", "weekly", "times", "com", "org", "www",
]);

/** Common English words that may be part of a publisher's name but never name it alone: "read", "print", "blank", "history". */
const COMMON_WORDS = new Set([
  "read", "print", "prints", "blank", "project", "projects", "history", "guild", "southern", "northern", "eastern", "western", "club",
  "metropolitan", "victoria", "albert", "royal", "academy", "society", "trust", "collection", "collections", "studio", "studios", "space",
  "house", "fine", "design", "culture", "cultural", "heritage", "library", "archive", "archives", "research", "studies", "association",
  "council", "department", "office", "public", "city", "state", "united", "kingdom", "america", "europe", "european", "west", "east", "north",
  "new", "york", "london", "paris", "cape", "town", "johannesburg", "durban", "pretoria", "monthly", "quarterly", "gazette", "post", "mail",
  "guardian", "observer", "standard", "independent", "herald", "tribune", "star", "sun", "world", "global", "street", "avenue", "road",
  "square", "park", "hall", "palace", "garden", "gardens", "building", "tower", "bridge", "exchange", "online", "network", "group", "works",
  "editions", "edition", "books", "papers", "paper", "images", "pictures", "visual", "digital", "media", "life", "living", "home", "people",
]);

/**
 * The words by which a source may be named in a sentence: its publisher's whole name; any run of
 * two or more of its words that is not all generic ("Everard Read", "Print Gallery", "blank
 * projects"); a distinctive single word, capitalised as written ("Tate", "Stevenson", "Iziko" —
 * never "read", "print", "history", "Institution"); an acronym the name gives in parentheses
 * ("C&", "MoMA"); and its role when the publisher states one — "Dan Halter (the artist)" may be named
 * as "the artist".
 */
export function namesOf(publisher: string): string[] {
  const parentheticals = [...publisher.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const roles = parentheticals.filter((r) => /^the\s+\p{L}+$/iu.test(r));
  const acronyms = parentheticals.filter((r) => /^[\p{Lu}&][\p{L}\p{N}&.-]{1,}$/u.test(r) && !/^the\s/i.test(r));
  const whole = publisher.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const tokens = whole.split(" ").filter(Boolean);
  const out = new Set<string>();
  if (whole.length >= 3) out.add(whole);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 2; j <= tokens.length; j++) {
      const run = tokens.slice(i, j);
      if (run.every((t) => NOT_A_NAME.has(t.toLowerCase()))) continue;
      out.add(run.join(" "));
    }
  }
  for (const t of tokens) {
    const word = t.replace(/[^\p{L}\p{N}'’&-]/gu, "");
    if (word.length < 3 || NOT_A_NAME.has(word.toLowerCase()) || COMMON_WORDS.has(word.toLowerCase())) continue;
    if (!/^\p{Lu}/u.test(word)) continue; // a lower-case word never names a source alone ("blank", "projects")
    out.add(word);
  }
  for (const r of roles) out.add(r);
  for (const a of acronyms) out.add(a);
  return [...out].filter((n) => n.length >= 2);
}

/** A single Title-case word is matched as written ("Tate", not "tate"); a run of words, an acronym or a role in any case. */
const matches = (text: string, name: string) => {
  const asWritten = !name.includes(" ") && /^\p{Lu}\p{Ll}/u.test(name);
  return new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, asWritten ? "u" : "iu").test(text);
};
const names = (text: string, list: string[]) => list.some((name) => matches(text, name));

const SPEECH_VERBS =
  "(?:says|said|writes|wrote|written|told|tells|notes|noted|observes|observed|argues|argued|describes|described|calls|called|puts it|put it|explains|explained|remarks|remarked|adds|added|recalls|recalled|comments|commented|states|stated|asks|asked|suggests|suggested|insists|insisted|believes|believed|considers|considered|reflects|reflected|continues|continued|declares|declared|maintains|maintained|points out|pointed out|speaks of|spoke of|talks about|talked about|concludes|concluded|admits|admitted|acknowledges|acknowledged|emphasises|emphasizes|emphasised|emphasized|stresses|stressed|contends|contended|reports|reported|recounts|recounted)";
const SPEECH = `(?:(?:has|had|have|once|also|later|famously|recently|himself|herself|then)\\s+)*${SPEECH_VERBS}`;
const CONNECTOR = "(?:de|van|von|da|du|le|la|den|der|al|el|wa|of)";
/** Two or more capitalised words, connectors allowed between them: "Hilton Als", "Lynette Yiadom-Boakye", "Jan van der Merwe". */
const NAME_RUN = `\\p{Lu}[\\p{L}'’.-]*(?:\\s+(?:\\p{Lu}[\\p{L}'’.-]*|${CONNECTOR}\\s+\\p{Lu}[\\p{L}'’.-]*))+`;

type Marker = { name: string; start: number; end: number };

const tidy = (run: string) => run.replace(/[.,;:]+$/g, "").trim();
const generic = (run: string) => run.split(/\s+/).every((t) => NOT_A_NAME.has(t.toLowerCase()) || COMMON_WORDS.has(t.toLowerCase()));

/** Where a passage shows someone speaking: "Hilton Als has written", "according to Hilton Als", "in Hilton Als's words". */
function speechMarkers(passage: string): Marker[] {
  const out: Marker[] = [];
  const patterns = [
    new RegExp(`(${NAME_RUN})(?:,[^,.;:]{0,80},)?\\s+(?:who\\s+)?${SPEECH}(?![\\p{L}])`, "gu"),
    new RegExp(`(?:according to|in the words of)\\s+(${NAME_RUN})(?![\\p{L}])`, "giu"),
    new RegExp(`(${NAME_RUN})['’]s\\s+(?:words|account|phrase|description|view|essay|text|review)(?![\\p{L}])`, "gu"),
  ];
  for (const re of patterns) {
    for (const m of passage.matchAll(re)) {
      const name = tidy(m[1]);
      if (generic(name)) continue;
      out.push({ name, start: m.index, end: m.index + m[0].length });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The people and bodies a passage shows speaking, in order — never a place, a prize or a title merely mentioned. */
export function speakersIn(passage: string): string[] {
  return [...new Set(speechMarkers(normalise(passage)).map((m) => m.name))];
}

/** The last two words of a run, where a sentence-initial word was swept into it ("In Frieze Hilton Als" → "Hilton Als"). */
const shortForm = (name: string) => {
  const words = name.split(/\s+/);
  return words.length > 2 ? [name, words.slice(-2).join(" ")] : [name];
};

/**
 * The speaker of these quoted words in the passage: the nearest marker before them, or, with none
 * before, the first after them in the same sentence (“I work from life,” she told Tate). With no
 * quotation given, every speaker in the passage.
 */
function speakersOf(passage: string, needle: string | null): string[] {
  const p = normalise(passage);
  const markers = speechMarkers(p);
  if (markers.length === 0) return [];
  if (needle === null) return markers.map((m) => m.name);
  const place = placeOf(p, needle);
  if (!place) return [];
  const before = markers.filter((m) => m.end <= place.start);
  if (before.length) return [before[before.length - 1].name];
  const after = markers.find((m) => m.start >= place.end && !/[.!?]/.test(p.slice(place.end, m.start)));
  return after ? [after.name] : [];
}

export type Attribution = { artistNames?: string[] };

const isArtist = (name: string, artist: string[]) => artist.some((a) => new RegExp(`(?<![\\p{L}])${escape(a)}(?![\\p{L}])`, "iu").test(name));
const namesArtist = (text: string, artist: string[]) => /(?<![\p{L}])the artist(?![\p{L}])/iu.test(text) || (artist.length > 0 && names(text, artist));
const statedArtist = (source: Pick<Source, "kind" | "publisher">) => source.kind === "supplied" && /\(the artist\)/i.test(source.publisher);

/**
 * Are these quoted words the artist's own? A supplied text whose author line says "(the artist)";
 * or a passage in which the artist is the one shown speaking them.
 */
export function artistsOwn(source: Pick<Source, "kind" | "publisher" | "passage">, needle: string | null, ctx: Attribution = {}): boolean {
  if (statedArtist(source)) return true;
  const artist = (ctx.artistNames ?? []).filter((n) => n.length >= 3);
  if (artist.length === 0) return false;
  return speakersOf(source.passage, needle).some((name) => isArtist(name, artist));
}

/**
 * Does the text (outside its quotations) name the source of these quoted words? Yes when it names
 * the publisher; or the person the passage itself shows speaking them (never the artist the draft
 * is about — naming its subject is not attribution); or the artist, as "the artist" or by name,
 * where the words are the artist's own.
 */
export function attributes(textOutsideQuotes: string, source: Pick<Source, "kind" | "publisher" | "passage">, ctx: Attribution = {}, needle: string | null = null): boolean {
  if (names(textOutsideQuotes, namesOf(source.publisher))) return true;
  const artist = (ctx.artistNames ?? []).filter((n) => n.length >= 3);
  const speakers = speakersOf(source.passage, needle);
  const others = speakers.filter((name) => !isArtist(name, artist)).flatMap(shortForm);
  if (names(textOutsideQuotes, others)) return true;
  if (artistsOwn(source, needle, ctx) && namesArtist(textOutsideQuotes, artist)) return true;
  return false;
}

/** The sentence gives the artist's own words to the artist: "the artist", the artist's name, or the author line of their supplied text. */
function attributedToArtist(textOutsideQuotes: string, source: Pick<Source, "kind" | "publisher">, ctx: Attribution): boolean {
  const artist = (ctx.artistNames ?? []).filter((n) => n.length >= 3);
  if (namesArtist(textOutsideQuotes, artist)) return true;
  return statedArtist(source) && names(textOutsideQuotes, namesOf(source.publisher));
}

const blank = (text: string, spans: Span[]) => spans.reduce((t, s) => t.slice(0, s.start) + " ".repeat(s.end - s.start) + t.slice(s.end), text);

function hits(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => m[0]);
}

/** `neverName`: words that must never appear — the collection's owner (rule 5). `artistNames`: the subject's, for attribution. */
export type Context = { living: boolean; neverName?: string[]; artistNames?: string[] };

/** The violations of one sentence against the list — an empty list means it may stay. */
export function checkSentence(s: Sentence, sources: Source[], ctx: Context): Violation[] {
  const v: Violation[] = [];
  const text = s.text.trim();
  if (text === NOT_ENOUGH) return v;

  const cited = s.sources.map((n) => sources.find((x) => x.n === n)).filter((x): x is Source => !!x);
  if (cited.length === 0) v.push({ rule: 4, why: "no source a person can check", match: "" });

  // The quotations: verbatim in a cited passage, whole words, and attributed in the sentence — or not a quotation.
  const quotes = quotationsIn(text);
  const outsideAll = blank(text, quotes);
  const attributed: Span[] = [];
  const own: Span[] = [];
  for (const q of quotes) {
    const needle = normalise(q.text);
    const owner = cited.find((src) => placeOf(normalise(src.passage), needle));
    if (!owner) {
      v.push({ rule: 7, why: "a quotation that is not verbatim in any cited source", match: q.text });
      continue;
    }
    if (!attributes(outsideAll, owner, ctx, needle)) {
      v.push({ rule: 3, why: `a quotation whose source (${owner.publisher}) is not named in the sentence`, match: q.text });
      continue;
    }
    attributed.push(q);
    if (artistsOwn(owner, needle, ctx) && attributedToArtist(outsideAll, owner, ctx)) own.push(q);
  }

  // Money, the market's facts and the sensitive classes: nowhere, quoted or not.
  for (const p of MONEY_PATTERNS) for (const m of hits(p.re, text)) v.push({ rule: 2, why: p.why, match: m });
  for (const m of hits(MARKET, text)) v.push({ rule: 2, why: "an auction house, a sale or a result", match: m });
  for (const m of hits(SENSITIVE, text)) v.push({ rule: 5, why: "a sensitive class: location, ownership, insurance or condition", match: m });

  // Outside an attributed verbatim quotation — or a title in italics, which is the work's words — the words of the
  // market, of rank and of the first person are the desk's own.
  const titles = italicsIn(text);
  const desk = blank(text, [...attributed, ...titles]);
  for (const m of hits(VALUE, desk)) v.push({ rule: 2, why: "a word of the market", match: m });
  for (const m of hits(RANK, desk)) v.push({ rule: 6, why: "a rank or superlative of our own", match: m });
  for (const p of RANK_PATTERNS) for (const m of hits(p.re, desk)) v.push({ rule: 6, why: p.why, match: m });
  for (const m of hits(VOICE, desk)) v.push({ rule: 7, why: "the first person outside a quotation", match: m });

  // A living person's private life: only in the artist's own words, given to the artist.
  if (ctx.living) for (const m of hits(PRIVATE, blank(text, [...own, ...titles]))) v.push({ rule: 8, why: "a living person's private life, not in their own words", match: m });

  for (const name of ctx.neverName ?? []) {
    if (name.length >= 3 && new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "iu").test(text)) v.push({ rule: 5, why: "names the collection or its owner", match: name });
  }

  return v;
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

const ABBREVIATIONS = new Set(["b", "d", "c", "ca", "dr", "mr", "mrs", "ms", "st", "no", "nos", "vol", "vols", "ed", "eds", "fig", "figs", "pp", "p", "cf", "etc", "jr", "sr", "prof", "approx", "e.g", "i.e", "vs"]);

/** Real sentences, not entries: a full stop, question or exclamation mark that ends a word and is followed by a capital, a digit or the end — "b. 1977" and "W. Kentridge" are not ends. */
export function sentenceCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let count = 0;
  for (const m of t.matchAll(/(\S*?)([.!?…]+)[”"’')\]]*(?=\s+[“"‘'*(\[]?[\p{Lu}\p{N}]|\s*$)/gu)) {
    const word = m[1].replace(/^[“"‘'(\[*]+/u, "");
    if (word && (ABBREVIATIONS.has(word.toLowerCase()) || /^\p{Lu}$/u.test(word))) continue;
    count++;
  }
  return Math.max(1, count);
}

const label = (field: Field) => (field === "why_they_matter" ? "why they matter" : field);
const inWords = (n: number) => ["no", "one", "two", "three", "four", "five"][n] ?? String(n);

/** The sentences that break a rule leave; the rest stay, in order. */
export function checkRules(field: Field, sentences: Sentence[], sources: Source[], ctx: Context): { kept: Sentence[]; removed: Removal[] } {
  void field;
  const kept: Sentence[] = [];
  const removed: Removal[] = [];
  for (const s of sentences) {
    const vs = checkSentence(s, sources, ctx);
    if (vs.length === 0) kept.push(s);
    else removed.push({ text: s.text, rule: vs[0].rule, why: vs.map((x) => `rule ${x.rule}: ${x.why}${x.match ? ` (“${x.match}”)` : ""}`).join("; ") });
  }
  return { kept, removed };
}

/** The lengths (rule 10): sentences beyond the limit leave from the end — counted as real sentences and as words. */
export function trimToLength(field: Field, sentences: Sentence[]): { kept: Sentence[]; removed: Removal[] } {
  const limit = LIMITS[field];
  const kept = [...sentences];
  const removed: Removal[] = [];
  const text = () => kept.map((s) => s.text).join(" ");
  if (limit.sentences !== null) {
    while (kept.length > 0 && sentenceCount(text()) > limit.sentences) {
      const extra = kept.pop()!;
      removed.push({ text: extra.text, rule: "length", why: `${label(field)} is at most ${inWords(limit.sentences)} sentences` });
    }
  }
  while (kept.length > 0 && wordCount(text()) > limit.words) {
    const extra = kept.pop()!;
    removed.push({ text: extra.text, rule: "length", why: `over ${limit.words} words` });
  }
  return { kept, removed };
}

/** The rules, then the lengths — what may stay, in order, and what left and why. */
export function checkField(field: Field, sentences: Sentence[], sources: Source[], ctx: Context): { kept: Sentence[]; removed: Removal[] } {
  const ruled = checkRules(field, sentences, sources, ctx);
  const trimmed = trimToLength(field, ruled.kept);
  return { kept: trimmed.kept, removed: [...ruled.removed, ...trimmed.removed] };
}
