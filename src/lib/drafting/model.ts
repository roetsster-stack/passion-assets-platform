/**
 * M2-04 · The model, as the desk sees it: three questions, each answered in a fixed shape. The real
 * one (anthropic.ts) runs on Workshop with the key; CI runs the desk against a stand-in that answers
 * from a script. Nothing in the desk depends on which.
 */
import type { Site } from "./allowlist";
import type { ProhibitionList } from "./list";
import type { ArtistInput, Field, Sentence, Source, Usage } from "./types";

export type SearchRequest = { artist: ArtistInput; sites: Site[] };
export type SearchAnswer = { sources: Omit<Source, "n">[]; usage: Usage };

export type DraftRequest = { artist: ArtistInput; sources: Source[]; list: ProhibitionList };
export type DraftAnswer = { biography: Sentence[]; whyTheyMatter: Sentence[] };

export type ReadingRequest = { artist: ArtistInput; list: ProhibitionList; field: Field; sentences: Sentence[]; sources: Source[] };
export type Verdict = { index: number; verdict: "keep" | "remove" | "flag"; rule: number | null; why: string };

export interface Model {
  /** The name recorded on every draft when the model answers nothing more exact. */
  readonly name: string;
  /** Passages about the artist from the allowlisted sites only, each with where it came from. */
  search(req: SearchRequest): Promise<SearchAnswer>;
  /** Sentences, each tied to the numbered sources it rests on. Returns the model's name as the API gave it. */
  draft(req: DraftRequest): Promise<{ answer: DraftAnswer; model: string; usage: Usage }>;
  /** The second reading against the list: a verdict on every sentence. */
  read(req: ReadingRequest): Promise<{ verdicts: Verdict[]; usage: Usage }>;
}

/** The desk's own failure: the model declined, or answered in a shape the desk cannot read. */
export class DeskError extends Error {}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** A sentence list from untrusted JSON — the model's answer is data, read carefully. */
export function asSentences(x: unknown, what: string): Sentence[] {
  if (!Array.isArray(x)) throw new DeskError(`${what}: expected a list of sentences`);
  return x.map((s, i) => {
    if (!s || typeof s !== "object" || typeof (s as { text?: unknown }).text !== "string" || !Array.isArray((s as { sources?: unknown }).sources)) {
      throw new DeskError(`${what}: sentence ${i + 1} is not { text, sources }`);
    }
    const sources = (s as { sources: unknown[] }).sources.filter(isInt);
    return { text: (s as { text: string }).text.trim(), sources };
  });
}

export function asDraftAnswer(x: unknown): DraftAnswer {
  if (!x || typeof x !== "object") throw new DeskError("the draft answer is not an object");
  const o = x as Record<string, unknown>;
  return { biography: asSentences(o.biography, "biography"), whyTheyMatter: asSentences(o.why_they_matter ?? o.whyTheyMatter, "why they matter") };
}

export function asVerdicts(x: unknown): Verdict[] {
  const list = x && typeof x === "object" && Array.isArray((x as { verdicts?: unknown }).verdicts) ? (x as { verdicts: unknown[] }).verdicts : x;
  if (!Array.isArray(list)) throw new DeskError("the second reading is not a list of verdicts");
  return list.map((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>;
    // a verdict the desk does not recognise is a doubt, never a pass (M2-04b)
    const verdict = o.verdict === "keep" || o.verdict === "remove" || o.verdict === "flag" ? o.verdict : "flag";
    if (!isInt(o.index)) throw new DeskError(`verdict ${i + 1} names no sentence`);
    const why = typeof o.why === "string" && o.why ? o.why : verdict === "flag" && o.verdict !== "flag" ? "the second reading gave no verdict" : "";
    return { index: o.index, verdict, rule: isInt(o.rule) ? o.rule : null, why };
  });
}
