/**
 * Loads the ingest vocabulary — residences, storage, framers, studios, owners — from a JSON file
 * outside the repository. Location and ownership are sensitive classes (CLAUDE.md), so the real
 * names live beside `~/curator/.env` on Workshop, never in git.
 *
 * Order: CURATOR_INGEST_RULES → ~/curator/ingest-rules.json. The repository ships
 * `ingest-rules.example.json` with placeholders, and the tests use a synthetic vocabulary.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { IngestRules } from "./map";

const OWNER_KINDS = new Set(["person", "joint", "company", "trust", "vehicle"]);

export function parseRules(json: unknown, source = "ingest rules"): IngestRules {
  const r = json as Partial<IngestRules> | null;
  const fail = (what: string): never => {
    throw new Error(`${source}: ${what}`);
  };
  if (!r || typeof r !== "object") fail("not an object");
  const strings = (k: keyof IngestRules): string[] => {
    const v = (r as Record<string, unknown>)[k];
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) fail(`${k} must be a list of strings`);
    return v as string[];
  };
  const defaultOwner = r!.defaultOwner;
  if (typeof defaultOwner !== "string" || !defaultOwner.trim()) return fail("defaultOwner is required");
  const owners = Array.isArray(r!.owners) ? r!.owners : [];
  for (const o of owners) {
    if (!o || typeof o.name !== "string" || !OWNER_KINDS.has(o.kind)) fail("each owner needs a name and a kind (person | joint | company | trust | vehicle)");
  }
  if (!owners.some((o) => o.name === defaultOwner)) fail("defaultOwner must be one of the owners");
  const studios = Array.isArray(r!.studios) ? r!.studios : [];
  for (const s of studios) {
    if (!s || typeof s.tag !== "string" || typeof s.name !== "string") fail("each studio needs a tag and a name");
  }
  return {
    defaultOwner,
    owners,
    residences: strings("residences"),
    storage: strings("storage"),
    framers: strings("framers"),
    studios,
  };
}

export function loadRules(): { rules: IngestRules; file: string } {
  const candidates = [process.env.CURATOR_INGEST_RULES, path.join(homedir(), "curator", "ingest-rules.json")].filter(
    (p): p is string => !!p,
  );
  const file = candidates.find((p) => existsSync(p));
  if (!file) {
    throw new Error(
      "No ingest rules file. Copy ingest-rules.example.json to ~/curator/ingest-rules.json on Workshop and fill in the real names (never in the repo).",
    );
  }
  return { rules: parseRules(JSON.parse(readFileSync(file, "utf8")), file), file };
}
