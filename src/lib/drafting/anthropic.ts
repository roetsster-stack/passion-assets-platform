/**
 * M2-04 · The real model: the Anthropic SDK, the one new dependency. Three calls per artist:
 * a search on the allowlisted sites that returns only what the API itself cited (the passage, the
 * page, the title — never the model's summary of it), a draft in a fixed JSON shape, and a second
 * reading against the list. The key is read from the environment on Workshop and nowhere else.
 */
import Anthropic from "@anthropic-ai/sdk";
import { siteFor, type Site } from "./allowlist";
import { describeArtist } from "./input";
import { plainRules } from "./list";
import { asDraftAnswer, asVerdicts, DeskError, type DraftRequest, type Model, type ReadingRequest, type SearchRequest } from "./model";
import { LIMITS } from "./rules";
import { NOT_ENOUGH, type Source, type Usage } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";

const SENTENCE_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "One sentence." },
    sources: { type: "array", items: { type: "integer" }, description: "The numbers of the sources this sentence rests on." },
  },
  required: ["text", "sources"],
  additionalProperties: false,
} as const;

export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    biography: { type: "array", items: SENTENCE_SCHEMA },
    why_they_matter: { type: "array", items: SENTENCE_SCHEMA },
  },
  required: ["biography", "why_they_matter"],
  additionalProperties: false,
} as const;

export const READING_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The sentence's number, from 1." },
          verdict: { type: "string", enum: ["keep", "remove", "flag"] },
          rule: { type: ["integer", "null"], description: "The rule broken, 1 to 10, or null." },
          why: { type: "string" },
        },
        required: ["index", "verdict", "rule", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

export const SEARCH_SYSTEM = `You are the research clerk of a private art register. Your job is to find, on the sites you are allowed to search and nowhere else, passages about one artist: where and when they were born and trained, where they live and work, what they make and how; what the artist, a curator or a critic has said the work is about, in their words; exhibitions and public collections as a museum or gallery states them. Quote every passage you use exactly as it is written on the page, so that each quotation carries its citation. Do not summarise in your own words, do not add anything from memory, and do not look for prices, sales, auction results or market standing. If the sites hold little, say so briefly and stop.`;

export const draftSystem = (rules: string) =>
  `You draft wall texts for a private art register, under a written list of things you must never do. The list:\n\n${rules}\n\nHow to write.\n- Write only from the numbered sources given to you. Every sentence must cite, by number, the sources it rests on, and every fact in it must appear in a cited passage. Your memory is not a source. No source, no sentence.\n- Quotation marks only around words copied exactly, letter for letter and capitals included, from a cited passage — and name in the same sentence who wrote or said them (the artist, the gallery, the museum, the critic). A ranking word or superlative may appear only inside such a quotation; your own words carry none.\n- No price, estimate, auction, market, investment or value in any form. Nothing about where a work is, who owns it, its insurance or condition. Nothing about a living person's private life beyond what they have published themselves.\n- Titles of works in *italics*, never in quotation marks. Write in the third person; never as the artist or the collector.\n- If the sources support little, write less. You may end with the exact sentence "${NOT_ENOUGH}", which needs no source. Never fill a gap with a guess.\n- biography: a short account of the person and the work, at most ${LIMITS.biography.words} words (sixty to eighty is right when the sources allow). why_they_matter: exactly one sentence of at most ${LIMITS.why_they_matter.words} words on why this artist matters, resting on a named source's own words; if no source says why, write "${NOT_ENOUGH}".\n- Register: plain, warm, exact — a museum's wall text, not a gallery's press release.\nAnswer in the JSON shape you are given and nothing else.`;

export const readingSystem = (rules: string) =>
  `You are the second reader of a drafting desk that writes under this list:\n\n${rules}\n\nYou are given one artist, the numbered sources, and the sentences of a draft with the sources each cites. For every sentence give a verdict: "keep" if it rests wholly on its cited passages and breaks no rule; "remove" if it states anything its cited passages do not say, carries any price, value, market or ranking word of the writer's own, quotes words that are not verbatim in a cited passage, touches a living person's private life beyond their own publication, or says anything about where a work is or who owns it — and name the rule; "flag" if you doubt it but cannot say which rule. The sentence "${NOT_ENOUGH}" needs no source. Judge every sentence; answer in the JSON shape you are given and nothing else.`;

const usageOf = (m: Anthropic.Message): Usage => ({
  requests: 1,
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
  webSearches: m.usage.server_tool_use?.web_search_requests ?? 0,
});

const textOf = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");

function refuseIfDeclined(m: Anthropic.Message, what: string) {
  if (m.stop_reason === "refusal") throw new DeskError(`the model declined to ${what}`);
  if (m.stop_reason === "max_tokens") throw new DeskError(`the model ran out of room while trying to ${what}`);
}

/** The API's own citations, as sources — only from the allowlisted sites, each passage once. */
export function citationsToSources(content: Anthropic.ContentBlock[], sites: Site[]): Omit<Source, "n">[] {
  const out: Omit<Source, "n">[] = [];
  const seen = new Set<string>();
  for (const block of content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      if (c.type !== "web_search_result_location") continue;
      const site = siteFor(c.url, sites);
      if (!site) continue;
      const passage = c.cited_text.replace(/\s+/g, " ").trim();
      if (!passage) continue;
      const key = `${c.url}\n${passage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "web", title: c.title?.trim() || c.url, publisher: site.name, link: c.url, passage });
    }
  }
  return out;
}

/** The JSON a structured answer carries, parsed; the model's text is data. */
export function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new DeskError(`${what}: the answer was not JSON`);
  }
}

export function sourcesForPrompt(sources: Source[]): string {
  return sources
    .map((s) => `[${s.n}] ${s.kind === "supplied" ? "Supplied text" : "Web"} — ${s.title} — ${s.publisher}${s.link ? ` — ${s.link}` : ""}\n${s.passage}`)
    .join("\n\n");
}

export function anthropicModel(options: { model?: string; client?: Anthropic; maxSearches?: number } = {}): Model {
  const model = options.model ?? process.env.CURATOR_DRAFT_MODEL ?? DEFAULT_MODEL;
  const client = options.client ?? new Anthropic();
  const maxSearches = options.maxSearches ?? 6;

  return {
    name: model,

    async search({ artist, sites }: SearchRequest) {
      let usage: Usage = { requests: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 };
      const sources: Omit<Source, "n">[] = [];
      if (sites.length === 0) return { sources, usage };
      let messages: Anthropic.MessageParam[] = [
        { role: "user", content: `${describeArtist(artist)}\n\nSearch the allowed sites for passages about this artist and quote them exactly, each with its page.` },
      ];
      // A long server-tool turn may pause; sending the turn back lets the server continue it.
      for (let turn = 0; turn < 4; turn++) {
        const response = await client.messages.create({
          model,
          max_tokens: 16000,
          system: SEARCH_SYSTEM,
          output_config: { effort: "medium" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches, allowed_domains: sites.map((s) => s.domain) }],
          messages,
        });
        usage = add(usage, usageOf(response));
        sources.push(...citationsToSources(response.content, sites));
        refuseIfDeclined(response, "search");
        if (response.stop_reason !== "pause_turn") break;
        messages = [...messages, { role: "assistant", content: response.content }];
      }
      return { sources: dedupe(sources), usage };
    },

    async draft({ artist, sources, list }: DraftRequest) {
      const response = await client.messages.create({
        model,
        max_tokens: 8000,
        system: draftSystem(plainRules(list)),
        output_config: { effort: "high", format: { type: "json_schema", schema: DRAFT_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "user", content: `${describeArtist(artist)}\n\nThe sources:\n\n${sourcesForPrompt(sources)}\n\nWrite the biography and the one sentence on why they matter.` }],
      });
      refuseIfDeclined(response, "draft");
      return { answer: asDraftAnswer(parseJson(textOf(response), "the draft")), model: response.model, usage: usageOf(response) };
    },

    async read({ artist, list, field, sentences, sources }: ReadingRequest) {
      const numbered = sentences.map((s, i) => `${i + 1}. ${s.text} [cites ${s.sources.join(", ") || "nothing"}]`).join("\n");
      const response = await client.messages.create({
        model,
        max_tokens: 8000,
        system: readingSystem(plainRules(list)),
        output_config: { effort: "high", format: { type: "json_schema", schema: READING_SCHEMA as unknown as Record<string, unknown> } },
        messages: [
          {
            role: "user",
            content: `${describeArtist(artist)}\n\nThe sources:\n\n${sourcesForPrompt(sources)}\n\nThe draft's "${field === "biography" ? "biography" : "why they matter"}" sentences:\n${numbered}\n\nGive a verdict on each.`,
          },
        ],
      });
      refuseIfDeclined(response, "read the draft");
      return { verdicts: asVerdicts(parseJson(textOf(response), "the second reading")), usage: usageOf(response) };
    },
  };
}

const add = (a: Usage, b: Usage): Usage => ({ requests: a.requests + b.requests, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, webSearches: a.webSearches + b.webSearches });

function dedupe(sources: Omit<Source, "n">[]): Omit<Source, "n">[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.link}\n${s.passage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
