/**
 * M2-04 · The rule checker — plain code, no model, fully tested. It reads a sentence with its
 * sources and says which rule it breaks, if any. Made strict in M2-04b, after the cold reviews of
 * PR #11 and PR #12. What it knows:
 *
 * - A sum of money, an auction house, a sale or a result (rule 2) and the sensitive classes
 *   (rule 5) may appear nowhere in a sentence — not even inside a quotation.
 * - The words of the market (rule 2) and the ranking words (rule 6) may appear only inside a
 *   quotation that passes the exact-match test and whose source is named in the sentence. A
 *   paraphrase never carries them.
 * - A living person's private life (rule 8) — family, health, relationships, sexuality, finances —
 *   may appear only inside such a quotation from the artist's own text (their supplied statement,
 *   or a passage in which the artist is the one speaking), given to the artist. Never a third
 *   party's remarks, quoted or not. The artist is the artist by their own whole name or by the
 *   surname alone — a relative with the surname, or a critic with the given name, is someone else —
 *   and the speaker of quoted words is found in the same sentence of the passage, never an earlier
 *   one. Where this fails, it fails safe.
 * - The exact-match test (rule 7, and rule 6 as Michael wrote it): the quoted words must appear in
 *   the passage of a cited source, beginning and ending at a word boundary — curly or straight
 *   quotes, spacing, dashes and markdown emphasis aside, letter for letter otherwise, capitals
 *   included. A quotation that fails is "not a quotation".
 * - A quotation must name its source in the same sentence (rule 3: "quoted … and attributed"): the
 *   publisher, by its whole name or a distinctive word of it, as written — never a common English
 *   word or phrase, never a first name; or the person the passage itself shows speaking those
 *   words — a name of two or more words beside a speech verb ("Hilton Als has written", "according
 *   to Hilton Als", "…," says Hilton Als) — never a place or a prize; or the artist, as "the artist"
 *   or by name, only where the words are the artist's own. Where the passage shows who spoke, the
 *   sentence may give the words to nobody else (rule 7): a critic's line is not the artist's, nor
 *   the artist's the critic's, whichever page is named beside it.
 * - Ten or more words of a source in a row, outside quotation marks, are the source's voice passed
 *   off as the desk's (rule 7, as Michael set it on 18 Nov): quote them, or rephrase.
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
 * lifted runs, the word lists, the sources and the lengths.
 */
import { NOT_ENOUGH, type Field, type Removal, type Sentence, type Source } from "./types";

export const LIMITS: Record<Field, { words: number; sentences: number | null }> = {
  biography: { words: 250, sentences: null },
  why_they_matter: { words: 60, sentences: 2 },
};

/** This many words of a source in a row, outside quotation marks, are lifted text (rule 7, 18 Nov). */
export const LIFT_WORDS = 10;

export type Violation = { rule: number; why: string; match: string };
type Span = { text: string; start: number; end: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A word list as one pattern: whole words only — a hyphen is not part of a word ("ex-wife", "world-famous") — and a space in a phrase may be a hyphen ("sell-out", "highly-regarded"). */
const phrases = (list: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((w) => escape(w).replace(/[ -]/g, "[\\s-]+")).join("|")})(?![\\p{L}\\p{N}])`, "giu");

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
  "sotheby's", "sotheby’s", "sothebys", "christie's", "christie’s", "christies", "bonhams", "strauss & co", "strauss and co",
  "aspire art", "sold at", "sold for", "sold out", "sell out", "sells out", "selling out", "fetched", "under the hammer", "hammer price",
  "record price", "record sum", "record sale", "auction result", "auction results", "auction record", "top lot", "estimated to reach",
  "estimated to fetch", "estimated at", "sale price", "sale", "sales",
];

/** Rule 2 again: Phillips is an auction house and a surname (Lisa Phillips) — the house, only beside a word of the auction room. */
const PHILLIPS = /(?<![\p{L}])Phillips(?![\p{L}])/gu;
const AUCTION_ROOM = /(?<![\p{L}])(?:auction\p{L}*|sold|sale|sales|lot|lots|hammer|estimates?|estimated|bids?|bidding|bidders?|consigned|consignment)(?![\p{L}])/iu;

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

/** "best known for" says what someone is known for, not that they are the best: not a rank (the review's nit, 18 Nov). */
const KNOWN_FOR = /(?<![\p{L}])best[\s-]+known\s+for(?![\p{L}])/giu;

/** Rule 5: the sensitive classes — never given to the desk, and never to appear. */
export const SENSITIVE_WORDS = [
  "insured", "insurance", "insurer", "condition report", "in good condition", "in poor condition", "in fair condition",
  "in excellent condition", "stored", "storage", "hangs in", "hangs at", "hanging in", "kept in", "kept at", "located in", "located at",
  "on loan from", "owned by", "owner", "owners", "ownership", "belongs to", "private collection", "private collections", "private collector",
  "private collectors", "the collector", "collector's", "collectors'", "collector’s", "collectors’",
];

/** Rule 8: a living person's private life — family, health, relationships, sexuality, finances — beyond what they published themselves. */
export const PRIVATE_WORDS = [
  "married", "marriage", "wife", "husband", "spouse", "divorce", "divorced", "girlfriend", "boyfriend", "fiancé", "fiancée", "fiance",
  "fiancee", "partner", "child", "children", "son", "sons", "his son", "her son", "daughter", "daughters", "his daughter", "her daughter",
  "father", "mother", "stepfather", "stepmother", "parents", "brother", "brothers", "sister", "sisters", "siblings", "family", "grandfather",
  "grandmother", "uncle", "aunt", "pregnant", "pregnancy", "illness", "ill health", "cancer", "diagnosed", "diagnosis", "depression",
  "addiction", "rehab", "sober", "sexuality", "sexual", "gay", "queer", "lesbian", "bisexual", "transgender", "homosexual", "bankrupt",
  "bankruptcy", "debt", "debts", "lawsuit", "sued", "arrested", "convicted", "affair", "salary", "earns", "income", "net worth",
];

/** A material, not a mother: skipped by the private-life check. */
const NOT_PRIVATE = /mother-of-pearl/gi;

/**
 * Where a living artist lives or works, closer than a city and a country — Michael, 18 Nov: "city and
 * country only, never a studio, a neighbourhood or an address". In code, narrowly (the pre-flight check
 * of 19 Nov; the review of PR #14): a street address — a number that is not a year (1800–2099), then
 * one to four capitalised words, then Road, Street, Avenue and their kin — and the studio's whereabouts
 * — "studio is in", "her studio in", "a studio at", followed by a capitalised place or a number, so
 * "the studio is in her house" is not caught. "The Bag Factory studios in Johannesburg" is neither, nor
 * "2012 Trafalgar Square". Narrow by design: "45 main road", "a studio on Bree Street", "Her Woodstock
 * studio", "Her studio, in Woodstock" and "12 Rue de Rivoli" pass here and are the brief's and the
 * second reading's, which name a neighbourhood too.
 */
export const STREET_ADDRESS =
  /(?<![\p{L}\p{N}])(?!(?:1[89]|20)\d{2}(?![\p{N}]))\d{1,5}[A-Za-z]?(?:[-–]\d{1,5})?\s+(?:\p{Lu}[\p{L}'’.-]*\s+){1,4}(?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Lane|Drive|Dr\.?|Boulevard|Crescent|Close|Terrace|Place|Square|Way)(?![\p{L}])/gu;
export const STUDIO_WHEREABOUTS =
  /(?<![\p{L}])(?:[Ss]tudios?\s+(?:(?:is|was|are|were)(?:\s+(?:located|situated|based))?|lies|sits|stands|located|situated|based)\s+(?:in|at|on)|(?:[Hh]is|[Hh]er|[Tt]heir|[Tt]he artist['’]s|[Aa]|[Tt]he)\s+studios?\s+(?:in|at))\s+(?=[\p{Lu}\p{N}])/gu;

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

const cleanWord = (t: string) => t.replace(/[^\p{L}\p{N}'’&-]/gu, "");
const isGenericWord = (t: string) => NOT_A_NAME.has(t.toLowerCase()) || COMMON_WORDS.has(t.toLowerCase());
const generic = (run: string) => run.split(/\s+/).every((t) => isGenericWord(cleanWord(t)));

/**
 * The names in one written name: the whole of it; any run of two or more of its words that is not
 * all generic ("Everard Read", "Iziko Museums" — never "South African History", "Victoria and",
 * "Print Gallery"); and a distinctive single word, capitalised ("Tate", "Stevenson", "Shainman" —
 * never "read", "history", "Institution"), unless it stands before another such word and so is a
 * first name ("Jack" Shainman, "Marian" Goodman, "Cécile" Fakhoury).
 */
function namesIn(whole: string): string[] {
  const tokens = whole.split(" ").filter(Boolean);
  const out: string[] = [];
  if (whole.length >= 3) out.push(whole);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 2; j <= tokens.length; j++) {
      if (i === 0 && j === tokens.length) continue;
      const run = tokens.slice(i, j).join(" ");
      if (!generic(run)) out.push(run);
    }
  }
  const distinctive = (t: string | undefined) => !!t && t.length >= 3 && /^\p{Lu}/u.test(t) && !isGenericWord(t);
  for (let i = 0; i < tokens.length; i++) {
    const word = cleanWord(tokens[i]);
    if (!distinctive(word)) continue;
    if (distinctive(cleanWord(tokens[i + 1] ?? ""))) continue; // a first name before a surname
    out.push(word);
  }
  return out;
}

/**
 * The words by which a source may be named in a sentence: its publisher's names (above); a second
 * name the allowlist gives in parentheses, whole ("Zeitz Museum of Contemporary Art Africa") and by
 * its own names; an acronym in parentheses ("C&", "MoMA", "SAHO"); and its role when the publisher
 * states one — "Dan Halter (the artist)" may be named as "the artist", "(the Met)" as the Met.
 */
export function namesOf(publisher: string): string[] {
  const parentheticals = [...publisher.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const roles = parentheticals.filter((r) => /^the\s+\p{L}+$/iu.test(r));
  const acronyms = parentheticals.filter((r) => /^[\p{Lu}&][\p{L}\p{N}&.-]{1,}$/u.test(r));
  const alsoNamed = parentheticals.filter((r) => !roles.includes(r) && !acronyms.includes(r) && r.includes(" "));
  const whole = publisher.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (const name of [whole, ...alsoNamed]) for (const n of namesIn(name)) out.add(n);
  for (const r of roles) out.add(r);
  for (const a of acronyms) out.add(a);
  return [...out].filter((n) => n.length >= 2);
}

/** A name is matched as written, capitals included — only a name of several words may start with either case, for a sentence's start ("The Met", "Blank projects"); a single word is as written ("Tate", never "tate"). */
const matches = (text: string, name: string) => {
  const first = name[0];
  const head = name.includes(" ") && /\p{L}/u.test(first) ? `[${first.toUpperCase()}${first.toLowerCase()}]` : escape(first);
  return new RegExp(`(?<![\\p{L}])${head}${escape(name.slice(1))}(?![\\p{L}])`, "u").test(text);
};
const names = (text: string, list: string[]) => list.some((name) => matches(text, name));

const SPEECH_VERBS =
  "(?:says|said|writes|wrote|written|told|tells|notes|noted|observes|observed|argues|argued|describes|described|calls|called|puts it|put it|explains|explained|remarks|remarked|adds|added|recalls|recalled|comments|commented|states|stated|asks|asked|suggests|suggested|insists|insisted|believes|believed|considers|considered|reflects|reflected|continues|continued|declares|declared|maintains|maintained|points out|pointed out|speaks of|spoke of|spoken of|spoken|talks about|talked about|concludes|concluded|admits|admitted|acknowledges|acknowledged|emphasises|emphasizes|emphasised|emphasized|stresses|stressed|contends|contended|reports|reported|recounts|recounted)";
const SPEECH = `(?:(?:has|had|have|once|also|later|famously|recently|himself|herself|then)\\s+)*${SPEECH_VERBS}`;
const CONNECTOR = "(?:de|van|von|da|du|le|la|den|der|al|el|wa|of)";
/** Two or more capitalised words, a connector allowed between them: "Hilton Als", "Lynette Yiadom-Boakye", "Jan van Wyk". */
const NAME_RUN = `\\p{Lu}[\\p{L}'’.-]*(?:\\s+(?:\\p{Lu}[\\p{L}'’.-]*|${CONNECTOR}\\s+\\p{Lu}[\\p{L}'’.-]*))+`;

type Marker = { name: string; start: number; end: number };

const tidy = (run: string) => run.replace(/[.,;:]+$/g, "").trim();

/**
 * Where a text shows someone speaking: "Hilton Als has written", "according to Hilton Als", "in
 * Hilton Als's words", and, straight after a quotation, "…," says Hilton Als. `who` is the pattern
 * for a speaker's name: a run of two or more capitalised words, or, for the sentence under check,
 * the artist's own names and "the artist" as well.
 */
function markersIn(text: string, who: string): Marker[] {
  const out: Marker[] = [];
  const patterns = [
    new RegExp(`(${who})(?:,[^,.;:]{0,80},)?\\s+(?:who\\s+)?${SPEECH}(?![\\p{L}])`, "gu"),
    new RegExp(`(?:according to|in the words of)\\s+(${who})(?![\\p{L}])`, "giu"),
    new RegExp(`(${who})['’]s\\s+(?:own\\s+)?(?:words|account|phrase|description|view|essay|text|review|statement)(?![\\p{L}])`, "gu"),
    new RegExp(`(?<=["'”’,])\\s*${SPEECH_VERBS}\\s+(${who})(?![\\p{L}])`, "gu"),
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = tidy(m[1]);
      if (generic(name) && !/^[Tt]he artist$/.test(name)) continue;
      out.push({ name, start: m.index, end: m.index + m[0].length });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const speechMarkers = (passage: string) => markersIn(passage, NAME_RUN);

/** The people and bodies a passage shows speaking, in order — never a place, a prize or a title merely mentioned. */
export function speakersIn(passage: string): string[] {
  return [...new Set(speechMarkers(normalise(passage)).map((m) => m.name))];
}

/**
 * Does a sentence end in this stretch of the passage, outside its quotations? The stretch runs from
 * a marker to the quoted words (`before`: it may end inside the quotation that holds them) or from
 * the quoted words to a marker (`after`: it may begin inside it). A full stop inside a quotation
 * does not end the sentence around it.
 */
function sentenceEndsIn(gap: string, side: "before" | "after"): boolean {
  let outside = gap.replace(/"[^"]*"/g, " ");
  if (side === "before") {
    const open = outside.lastIndexOf('"');
    if (open >= 0) outside = outside.slice(0, open);
  } else {
    const close = outside.indexOf('"');
    if (close >= 0) outside = outside.slice(close + 1);
  }
  return /[.!?]/.test(outside);
}

/**
 * The speaker of these quoted words in the passage: the nearest marker before them in the same
 * sentence, or, with none, the first after them in the same sentence (“I work from life,” she told
 * Tate; "…," says Hilton Als). Never a marker in an earlier sentence (the review's blocker 1). With
 * no quotation given, every speaker in the passage.
 */
function speakersOf(passage: string, needle: string | null): string[] {
  const p = normalise(passage);
  const markers = speechMarkers(p);
  if (markers.length === 0) return [];
  if (needle === null) return markers.map((m) => m.name);
  const place = placeOf(p, needle);
  if (!place) return [];
  const before = markers.filter((m) => m.end <= place.start && !sentenceEndsIn(p.slice(m.end, place.start), "before"));
  if (before.length) return [before[before.length - 1].name];
  const after = markers.find((m) => m.start >= place.end && !sentenceEndsIn(p.slice(place.end, m.start), "after"));
  return after ? [after.name] : [];
}

/** The artist the draft is about, by name: the surname, the given name, and the register's display name. */
export type ArtistName = { surname: string; givenName: string | null; displayName?: string | null };
export type Attribution = { artist?: ArtistName };

const THE_ARTIST = "the artist";

/** The artist's own names, whole ("Igshaan Adams", "William Kentridge"), and the surname alone. */
function ownNames(artist?: ArtistName): { full: string[]; surname: string | null } {
  if (!artist) return { full: [], surname: null };
  const full = [artist.displayName ?? null, artist.givenName ? `${artist.givenName} ${artist.surname}` : null].filter((n): n is string => !!n && n.length >= 3).map(normalise);
  const surname = normalise(artist.surname);
  return { full: [...new Set(full)], surname: surname.length >= 3 ? surname : null };
}

/**
 * Is this speaker the artist? Only by the artist's own whole name — a word swept in before it aside
 * ("In Frieze Igshaan Adams") — or by the surname alone. "Sydney Kentridge" is not William; "Dan
 * Cameron" is not Dan Halter.
 */
const isArtist = (name: string, artist?: ArtistName) => {
  const { full, surname } = ownNames(artist);
  return full.some((f) => name === f || name.endsWith(" " + f)) || (surname !== null && name === surname);
};

/** The artist's own words by their source: a supplied text, or a book by the artist (M2-04c), whose author line says "(the artist)". */
const statedArtist = (source: Pick<Source, "kind" | "publisher">) => (source.kind === "supplied" || source.kind === "book") && /\(the artist\)/i.test(source.publisher);

/** Two names for one person: the same, or one the other with a word swept in before it ("In Frieze Hilton Als", "Hilton Als"). */
const sameName = (a: string, b: string) => a === b || a.endsWith(" " + b) || b.endsWith(" " + a);
/** A run's last two words as well, where a sentence-initial word was swept into it. */
const shortForms = (name: string) => {
  const words = name.split(/\s+/);
  return words.length > 2 ? [name, words.slice(-2).join(" ")] : [name];
};

/**
 * Who the sentence itself says spoke the words: the artist — "the artist", or the artist's name,
 * beside a speech verb ("Adams told Frieze", "in Halter's words", "the artist says") — or a named
 * person ("Jane Doe writes"). A bare mention of a name is not a claim.
 */
function claimedSpeakers(textOutsideQuotes: string, ctx: Attribution): string[] {
  const { full, surname } = ownNames(ctx.artist);
  const artistAlt = ["[Tt]he artist", ...full.map(escape), ...(surname ? [escape(surname)] : [])].join("|");
  const who = `${NAME_RUN}|${artistAlt}`;
  const out: string[] = [];
  for (const m of markersIn(normalise(textOutsideQuotes), who)) {
    const name = /^[Tt]he artist$/.test(m.name) || isArtist(m.name, ctx.artist) ? THE_ARTIST : m.name;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Are these quoted words the artist's own? A supplied text whose author line says "(the artist)";
 * or a passage in which the artist — by their own name — is the one shown speaking them.
 */
export function artistsOwn(source: Pick<Source, "kind" | "publisher" | "passage">, needle: string | null, ctx: Attribution = {}): boolean {
  if (statedArtist(source)) return true;
  return speakersOf(source.passage, needle).some((name) => isArtist(name, ctx.artist));
}

export type AttributionResult = { ok: true } | { ok: false; rule: 3 | 7; why: string };

/**
 * Does the sentence (outside its quotations) attribute these quoted words rightly? Where the
 * passage shows who spoke them — the artist, by their own name, or another person — the sentence
 * may give them to nobody else (rule 7); it may name that speaker, or name the page and no speaker.
 * Where the passage shows nobody, the page must be named (rule 3), and a speaker the sentence
 * names is left to the second reading — except the artist: quoted words given to the artist where
 * the passage shows no one speaking are removed (rule 7), whichever page is named, because the
 * code cannot follow "Doe argues" or "the magazine's critic" back to a name it knows; it fails safe
 * (the pre-flight check of 19 Nov). Naming the artist, or the artist's text, as mere subject is not
 * attribution.
 */
export function attribution(textOutsideQuotes: string, source: Pick<Source, "kind" | "publisher" | "passage">, ctx: Attribution = {}, needle: string | null = null): AttributionResult {
  const pageNames = namesOf(source.publisher);
  const page = names(textOutsideQuotes, pageNames);
  const shown = statedArtist(source) ? [THE_ARTIST] : speakersOf(source.passage, needle).map((n) => (isArtist(n, ctx.artist) ? THE_ARTIST : n));
  const claimed = claimedSpeakers(textOutsideQuotes, ctx).filter((c) => c === THE_ARTIST || !pageNames.some((n) => sameName(n, c)));
  const unnamed = { ok: false as const, rule: 3 as const, why: `a quotation whose source (${source.publisher}) is not named in the sentence` };
  if (shown.length === 0) {
    if (claimed.includes(THE_ARTIST)) return { ok: false, rule: 7, why: "a quotation given to the artist, where the passage shows no one speaking" };
    return page ? { ok: true } : unnamed;
  }
  const wrong = claimed.find((c) => !shown.some((s) => sameName(s, c)));
  if (wrong) return { ok: false, rule: 7, why: `a quotation given to ${wrong}, where the passage shows ${shown.join(" or ")} speaking` };
  if (claimed.length > 0 || page) return { ok: true };
  // the shown speaker named without a speech verb ("for Hilton Als, …") — never the artist, whose bare name is the subject
  if (shown.some((s) => s !== THE_ARTIST && names(textOutsideQuotes, shortForms(s)))) return { ok: true };
  return unnamed;
}

/** Does the sentence name the source of these quoted words, rightly? (The yes-or-no of `attribution`.) */
export const attributes = (textOutsideQuotes: string, source: Pick<Source, "kind" | "publisher" | "passage">, ctx: Attribution = {}, needle: string | null = null): boolean =>
  attribution(textOutsideQuotes, source, ctx, needle).ok;

/** The sentence gives the words to the artist: "the artist" or the artist's name beside a speech verb — or, for the artist's supplied text, its author line. */
function givenToArtist(textOutsideQuotes: string, source: Pick<Source, "kind" | "publisher">, ctx: Attribution): boolean {
  if (claimedSpeakers(textOutsideQuotes, ctx).includes(THE_ARTIST)) return true;
  return statedArtist(source) && names(textOutsideQuotes, namesOf(source.publisher));
}

const blank = (text: string, spans: Span[]) => spans.reduce((t, s) => t.slice(0, s.start) + " ".repeat(s.end - s.start) + t.slice(s.end), text);

function hits(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => m[0]);
}

/** The words of a text, lower-cased, punctuation aside — for the lifted-run test, where a changed capital or comma hides nothing. */
const wordsOf = (text: string) =>
  normalise(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));

/** The stretches of a sentence outside the given spans, each as words — a run never crosses a quotation or a title. */
function stretchesOutside(text: string, spans: Span[]): string[][] {
  const out: string[][] = [];
  let at = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start > at) out.push(wordsOf(text.slice(at, s.start)));
    at = Math.max(at, s.end);
  }
  out.push(wordsOf(text.slice(at)));
  return out;
}

/**
 * The longest run of LIFT_WORDS or more words that a stretch of the sentence shares, in order, with
 * any source's passage — lifted text, not a paraphrase (rule 7, 18 Nov) — and whose it is.
 */
export function liftedRun(text: string, spans: Span[], sources: Source[]): { words: string; n: number } | null {
  let best: { words: string; n: number; length: number } | null = null;
  const passages = sources.map((src) => ({ n: src.n, words: wordsOf(src.passage) }));
  for (const words of stretchesOutside(text, spans)) {
    if (words.length < LIFT_WORDS) continue;
    for (const { n, words: pw } of passages) {
      for (let i = 0; i + LIFT_WORDS <= words.length; i++) {
        for (let p = 0; p + LIFT_WORDS <= pw.length; p++) {
          if (words[i] !== pw[p]) continue;
          let k = 1;
          while (i + k < words.length && p + k < pw.length && words[i + k] === pw[p + k]) k++;
          if (k >= LIFT_WORDS && (!best || k > best.length)) best = { words: words.slice(i, i + k).join(" "), n, length: k };
        }
      }
    }
  }
  return best ? { words: best.words, n: best.n } : null;
}

/** `neverName`: words that must never appear — the collection's owner (rule 5). `artist`: the subject's names, for attribution. */
export type Context = { living: boolean; neverName?: string[]; artist?: ArtistName };

/** The violations of one sentence against the list — an empty list means it may stay. */
export function checkSentence(s: Sentence, sources: Source[], ctx: Context): Violation[] {
  const v: Violation[] = [];
  const text = s.text.trim();
  if (text === NOT_ENOUGH) return v;

  const cited = s.sources.map((n) => sources.find((x) => x.n === n)).filter((x): x is Source => !!x);
  if (cited.length === 0) v.push({ rule: 4, why: "no source a person can check", match: "" });

  // The quotations: verbatim in a cited passage, whole words, and attributed in the sentence to the right speaker — or not a quotation.
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
    const given = attribution(outsideAll, owner, ctx, needle);
    if (!given.ok) {
      v.push({ rule: given.rule, why: given.why, match: q.text });
      continue;
    }
    attributed.push(q);
    if (artistsOwn(owner, needle, ctx) && givenToArtist(outsideAll, owner, ctx)) own.push(q);
  }

  // A source's words in a row, outside quotation marks: lifted, not paraphrased.
  const titles = italicsIn(text);
  const lifted = liftedRun(text, [...quotes, ...titles], sources);
  if (lifted) v.push({ rule: 7, why: `${lifted.words.split(" ").length} words of source [${lifted.n}] in a row without quotation marks — quote them, or rephrase`, match: lifted.words });

  // Money, the market's facts and the sensitive classes: nowhere, quoted or not.
  for (const p of MONEY_PATTERNS) for (const m of hits(p.re, text)) v.push({ rule: 2, why: p.why, match: m });
  for (const m of hits(MARKET, text)) v.push({ rule: 2, why: "an auction house, a sale or a result", match: m });
  if (AUCTION_ROOM.test(text)) for (const m of hits(PHILLIPS, text)) v.push({ rule: 2, why: "an auction house", match: m });
  for (const m of hits(SENSITIVE, text)) v.push({ rule: 5, why: "a sensitive class: location, ownership, insurance or condition", match: m });

  // Outside an attributed verbatim quotation — or a title in italics, which is the work's words — the words of the
  // market, of rank and of the first person are the desk's own.
  const desk = blank(text, [...attributed, ...titles]);
  for (const m of hits(VALUE, desk)) v.push({ rule: 2, why: "a word of the market", match: m });
  const ranked = desk.replace(KNOWN_FOR, (m) => " ".repeat(m.length));
  for (const m of hits(RANK, ranked)) v.push({ rule: 6, why: "a rank or superlative of our own", match: m });
  for (const p of RANK_PATTERNS) for (const m of hits(p.re, ranked)) v.push({ rule: 6, why: p.why, match: m });
  for (const m of hits(VOICE, desk)) v.push({ rule: 7, why: "the first person outside a quotation", match: m });

  // A living person's private life: only in the artist's own words, given to the artist.
  if (ctx.living) {
    const personal = blank(text, [...own, ...titles]).replace(NOT_PRIVATE, (m) => " ".repeat(m.length));
    for (const m of hits(PRIVATE, personal)) v.push({ rule: 8, why: "a living person's private life, not in their own words", match: m });
    // Where they live and work, closer than a city and a country — in anyone's words, the artist's included (18 Nov).
    const where = blank(text, titles);
    for (const m of hits(STREET_ADDRESS, where)) v.push({ rule: 8, why: "where a living artist lives or works, closer than a city and a country: a street address", match: m });
    for (const m of hits(STUDIO_WHEREABOUTS, where)) v.push({ rule: 8, why: "where a living artist lives or works, closer than a city and a country: the studio's whereabouts", match: m.trim() });
  }

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
