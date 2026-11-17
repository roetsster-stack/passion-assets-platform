/**
 * M2-04 · The drafting desk — the shapes. A draft is sentences, each tied to numbered sources; a
 * source is a passage a person can read, with who published it and where; what the desk removed is
 * kept beside what it kept, so the restraint is visible. Nothing here knows about the database.
 */

export type Field = "biography" | "why_they_matter";
export const FIELDS: Field[] = ["biography", "why_they_matter"];

/** A passage a person can check. `n` is the number the model cites. */
export type Source = {
  n: number;
  kind: "supplied" | "web";
  title: string;
  publisher: string;
  link: string | null;
  passage: string;
};

/** One sentence and the sources it rests on. */
export type Sentence = { text: string; sources: number[] };

/** Why a sentence left the draft: a rule's number, or one of the desk's own reasons. */
export type Removal = { text: string; rule: number | "uncited" | "reading" | "length"; why: string };
export type Flag = { text: string; why: string };

export type FieldDraft = { field: Field; sentences: Sentence[]; text: string; removed: Removal[]; flagged: Flag[] };

export type Usage = { requests: number; inputTokens: number; outputTokens: number; webSearches: number };
export const NO_USAGE: Usage = { requests: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 };
export const addUsage = (a: Usage, b: Usage): Usage => ({
  requests: a.requests + b.requests,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  webSearches: a.webSearches + b.webSearches,
});

/** What the desk is told about a work: its title, year and medium — nothing else (rule 5). */
export type WorkInput = { title: string | null; year: string | null; medium: string | null };

/** What the desk is told about an artist — the whole of it. */
export type ArtistInput = {
  id: string;
  displayName: string;
  surname: string;
  givenName: string | null;
  nationality: string[];
  birthYear: number | null;
  deathYear: number | null;
  works: WorkInput[];
};

export type Draft = {
  artist: ArtistInput;
  listVersion: string;
  model: string;
  sources: Source[];
  fields: FieldDraft[];
  usage: Usage;
  notes: string[];
};

/** Rule 10's answer. The one sentence the desk may write on no source. */
export const NOT_ENOUGH = "Not enough is known yet.";
