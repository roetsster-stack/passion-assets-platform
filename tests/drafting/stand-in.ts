/** A model that answers from a script — the desk under test, no key, no network. */
import type { DraftAnswer, DraftRequest, Model, ReadingRequest, SearchAnswer, SearchRequest, Verdict } from "@/lib/drafting/model";
import { NO_USAGE, type Source } from "@/lib/drafting/types";

export type Script = {
  name?: string;
  found?: Omit<Source, "n">[];
  answer?: DraftAnswer;
  model?: string;
  verdicts?: (req: ReadingRequest) => Verdict[];
};

export function standIn(script: Script = {}) {
  const calls = { search: [] as SearchRequest[], draft: [] as DraftRequest[], read: [] as ReadingRequest[] };
  const model: Model = {
    name: script.name ?? "stand-in",
    async search(req): Promise<SearchAnswer> {
      calls.search.push(req);
      return { sources: script.found ?? [], usage: { ...NO_USAGE, requests: 1, webSearches: 2 } };
    },
    async draft(req) {
      calls.draft.push(req);
      return { answer: script.answer ?? { biography: [], whyTheyMatter: [] }, model: script.model ?? script.name ?? "stand-in", usage: { ...NO_USAGE, requests: 1 } };
    },
    async read(req) {
      calls.read.push(req);
      return { verdicts: script.verdicts ? script.verdicts(req) : req.sentences.map((_, i) => ({ index: i + 1, verdict: "keep" as const, rule: null, why: "" })), usage: { ...NO_USAGE, requests: 1 } };
    },
  };
  return { model, calls };
}
