/**
 * M2-04 · The report Michael reads: five drafts, the sources beside them, what was removed and why.
 * Markdown, one file per run. Every draft is marked as a draft; nothing here approves anything.
 */
import type { Site } from "./allowlist";
import type { Draft, Field } from "./types";

export type RunMeta = {
  date: Date;
  listPath: string;
  listVersion: string;
  model: string;
  allowlistPath: string;
  sites: Site[];
  unresolved: Site[];
  contextDir: string | null;
  table: "written" | "missing" | "skipped";
  failures: { artist: string; error: string }[];
};

const label: Record<Field, string> = { biography: "Biography", why_they_matter: "Why they matter" };
const marks = (sources: number[]) => (sources.length ? " " + sources.map((n) => `[${n}]`).join("") : "");

export function renderDraft(d: Draft): string {
  const out: string[] = [];
  out.push(`## ${d.artist.displayName}`);
  out.push("");
  out.push(`_DRAFT — not approved. List ${d.listVersion.slice(0, 12)} · model ${d.model} · ${d.usage.requests} requests, ${d.usage.webSearches} searches, ${d.usage.inputTokens.toLocaleString("en-GB")} in / ${d.usage.outputTokens.toLocaleString("en-GB")} out._`);
  if (d.notes.length) out.push(`_${d.notes.join("; ")}._`);
  for (const [field, a] of Object.entries(d.answers ?? {})) {
    if (a) out.push(`_Written to answer the owner's note on the previous ${label[field as Field].toLowerCase()}: “${a.note}”._`);
  }
  out.push("");
  for (const f of d.fields) {
    out.push(`**${label[f.field]}.** ${f.sentences.length ? f.sentences.map((s) => s.text + marks(s.sources)).join(" ") : "_(nothing survived the checks)_"}`);
    out.push("");
  }
  if (d.sources.length) {
    out.push("**Sources.**");
    for (const s of d.sources) {
      out.push(s.kind === "book" ? `- [${s.n}] ${s.title} — ${s.publisher} — book` : `- [${s.n}] ${s.title} — ${s.publisher}${s.link ? ` — ${s.link}` : " — supplied text"}`);
      out.push(`  > ${s.passage}`);
    }
    out.push("");
  }
  const removed = d.fields.flatMap((f) => f.removed.map((r) => ({ field: f.field, ...r })));
  if (removed.length) {
    out.push("**Removed by the desk.**");
    for (const r of removed) out.push(`- (${label[r.field]}; ${typeof r.rule === "number" ? `rule ${r.rule}` : r.rule}) “${r.text}” — ${r.why}`);
    out.push("");
  }
  const flagged = d.fields.flatMap((f) => f.flagged.map((r) => ({ field: f.field, ...r })));
  if (flagged.length) {
    out.push("**Flagged by the second reading (kept).**");
    for (const r of flagged) out.push(`- (${label[r.field]}) “${r.text}” — ${r.why}`);
    out.push("");
  }
  return out.join("\n");
}

export function renderReport(drafts: Draft[], meta: RunMeta): string {
  const out: string[] = [];
  const day = meta.date.toISOString().slice(0, 10);
  out.push(`# Drafts — ${day}`);
  out.push("");
  out.push(`_Written by the drafting desk (M2-04) under the prohibition list at \`${meta.listPath}\`, version \`${meta.listVersion}\`, with ${meta.model}. Every text here is a draft until a named person approves it; approving is M2-01._`);
  out.push("");
  out.push(`- Supplied texts: ${meta.contextDir ? `\`${meta.contextDir}/artists/\`` : "none (CURATOR_CONTEXT_DIR not set)"}`);
  out.push(`- Searched: ${meta.sites.length} allowlisted sites from \`${meta.allowlistPath}\`${meta.unresolved.length ? `; did not resolve and were not searched: ${meta.unresolved.map((s) => s.domain).join(", ")}` : ""}`);
  out.push(`- The drafts table: ${meta.table === "written" ? "written" : meta.table === "missing" ? "not created yet (the migration awaits a yes) — the drafts live in this report only" : "not written (--no-db)"}`);
  if (meta.failures.length) out.push(`- Not drafted: ${meta.failures.map((f) => `${f.artist} (${f.error})`).join("; ")}`);
  out.push("");
  for (const d of drafts) {
    out.push(renderDraft(d));
    out.push("");
  }
  const total = drafts.reduce((u, d) => ({ requests: u.requests + d.usage.requests, inputTokens: u.inputTokens + d.usage.inputTokens, outputTokens: u.outputTokens + d.usage.outputTokens, webSearches: u.webSearches + d.usage.webSearches }), { requests: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 });
  out.push(`_In all: ${total.requests} requests, ${total.webSearches} web searches, ${total.inputTokens.toLocaleString("en-GB")} input tokens, ${total.outputTokens.toLocaleString("en-GB")} output tokens._`);
  out.push("");
  return out.join("\n");
}
