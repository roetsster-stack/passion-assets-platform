/**
 * M2-04 · The desk. For one artist: the supplied texts first, then the allowlisted search; the
 * model asked for sentences tied to source numbers; any sentence resting on a source that does not
 * exist dropped; the rule checker; the second reading against the list; the lengths. What leaves
 * is listed beside what stays. Every draft carries the list's version and the model's name.
 */
import type { Site } from "./allowlist";
import { isLiving } from "./input";
import type { ProhibitionList } from "./list";
import type { Model } from "./model";
import { checkField } from "./rules";
import { addUsage, NO_USAGE, NOT_ENOUGH, type ArtistInput, type Draft, type Field, type FieldDraft, type Flag, type Removal, type Sentence, type Source } from "./types";

export type DeskDeps = {
  model: Model;
  list: ProhibitionList;
  sites: Site[];
  /** The supplied passages for an artist, unnumbered — the desk numbers them before anything from the web. */
  supplied: (artist: ArtistInput) => Omit<Source, "n">[];
  /** Words that must never appear in a draft: the collection's owner, by name (rule 5). */
  neverName?: string[];
};

export const number = (sources: Omit<Source, "n">[]): Source[] => sources.map((s, i) => ({ ...s, n: i + 1 }));

/** Sentences whose every cited source exists; the others, with why. "Not enough is known yet." needs none. */
export function dropUncited(sentences: Sentence[], sources: Source[]): { kept: Sentence[]; removed: Removal[] } {
  const known = new Set(sources.map((s) => s.n));
  const kept: Sentence[] = [];
  const removed: Removal[] = [];
  for (const s of sentences) {
    if (s.text.trim() === NOT_ENOUGH) {
      kept.push({ text: NOT_ENOUGH, sources: [] });
      continue;
    }
    const missing = s.sources.filter((n) => !known.has(n));
    if (s.sources.length === 0) removed.push({ text: s.text, rule: "uncited", why: "rests on no source" });
    else if (missing.length) removed.push({ text: s.text, rule: "uncited", why: `cites a source that does not exist (${missing.join(", ")})` });
    else kept.push(s);
  }
  return { kept, removed };
}

export async function draftArtist(artist: ArtistInput, deps: DeskDeps): Promise<Draft> {
  const notes: string[] = [];
  let usage = NO_USAGE;

  const supplied = deps.supplied(artist);
  if (supplied.length === 0) notes.push("no supplied text");
  let web: Omit<Source, "n">[] = [];
  if (deps.sites.length === 0) notes.push("no sites to search");
  else {
    const found = await deps.model.search({ artist, sites: deps.sites });
    usage = addUsage(usage, found.usage);
    web = found.sources;
    if (web.length === 0) notes.push("the search found nothing on the allowed sites");
  }
  const sources = number([...supplied, ...web]);

  let model = deps.model.name;
  const fields: FieldDraft[] = [];
  const living = isLiving(artist);

  if (sources.length === 0) {
    // Nothing to write from: the list's own answer, and no call to the model (rule 4, rule 10).
    notes.push("no sources at all — nothing was asked of the model");
    for (const field of ["biography", "why_they_matter"] as Field[]) {
      fields.push({ field, sentences: [{ text: NOT_ENOUGH, sources: [] }], text: NOT_ENOUGH, removed: [], flagged: [] });
    }
    return { artist, listVersion: deps.list.version, model, sources, fields, usage, notes };
  }

  const drafted = await deps.model.draft({ artist, sources, list: deps.list });
  usage = addUsage(usage, drafted.usage);
  model = drafted.model || model;

  for (const [field, sentences] of [
    ["biography", drafted.answer.biography],
    ["why_they_matter", drafted.answer.whyTheyMatter],
  ] as [Field, Sentence[]][]) {
    const removed: Removal[] = [];
    const flagged: Flag[] = [];

    const cited = dropUncited(sentences, sources);
    removed.push(...cited.removed);

    const ruled = checkField(field, cited.kept, sources, { living, neverName: deps.neverName });
    removed.push(...ruled.removed.filter((r) => r.rule !== "length"));
    let kept = ruled.kept;
    const lengthRemovals = ruled.removed.filter((r) => r.rule === "length");

    if (kept.length > 0) {
      const reading = await deps.model.read({ artist, list: deps.list, field, sentences: kept, sources });
      usage = addUsage(usage, reading.usage);
      const after: Sentence[] = [];
      kept.forEach((s, i) => {
        const v = reading.verdicts.find((x) => x.index === i + 1);
        if (v?.verdict === "remove") removed.push({ text: s.text, rule: "reading", why: `the second reading${v.rule ? ` (rule ${v.rule})` : ""}: ${v.why || "removed"}` });
        else {
          if (v?.verdict === "flag") flagged.push({ text: s.text, why: v.why || "the second reading doubted it" });
          after.push(s);
        }
      });
      kept = after;
    }
    removed.push(...lengthRemovals);

    fields.push({ field, sentences: kept, text: kept.map((s) => s.text).join(" "), removed, flagged });
  }

  const cited = new Set(fields.flatMap((f) => f.sentences.flatMap((s) => s.sources)));
  return { artist, listVersion: deps.list.version, model, sources: sources.filter((s) => cited.has(s.n)), fields, usage, notes };
}
