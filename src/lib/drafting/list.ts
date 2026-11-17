/**
 * M2-04 · The prohibition list — the law of the desk. Read from docs/drafting/prohibition-list.md at
 * run time; the desk refuses to run without it. Its version is the file's git hash (the blob id git
 * itself would give the file's bytes), so a changed word is a new version and every draft says which
 * version it was written under.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type Rule = { n: number; text: string };
export type ProhibitionList = { path: string; version: string; rules: Rule[]; register: string | null; text: string };

export class ListMissing extends Error {}

/** The hash git gives a file's content: sha1 over "blob <bytes>\0<content>". */
export function gitBlobHash(content: string | Buffer): string {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** The numbered rules (a rule may wrap onto indented lines) and the Register line. */
export function parseList(markdown: string): { rules: Rule[]; register: string | null } {
  const rules: Rule[] = [];
  let register: string | null = null;
  let open = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const numbered = raw.match(/^(\d+)\.\s+(\S.*)$/);
    if (numbered) {
      rules.push({ n: Number(numbered[1]), text: numbered[2].trim() });
      open = true;
      continue;
    }
    if (open && /^\s{2,}\S/.test(raw)) {
      rules[rules.length - 1].text += " " + raw.trim();
      continue;
    }
    open = false;
    const r = raw.match(/^Register:\s*(.*)$/);
    if (r) register = r[1].trim();
  }
  return { rules, register };
}

export function loadList(path: string): ProhibitionList {
  if (!existsSync(path)) throw new ListMissing(`The prohibition list is missing (${path}). The desk does not run without it.`);
  const text = readFileSync(path, "utf8");
  const { rules, register } = parseList(text);
  if (rules.length !== 10 || rules.some((r, i) => r.n !== i + 1)) {
    throw new ListMissing(`The prohibition list at ${path} should hold rules 1 to 10; found ${rules.map((r) => r.n).join(", ") || "none"}.`);
  }
  return { path, version: gitBlobHash(text), rules, register, text };
}

/** The rules as plain lines for a prompt: no markdown emphasis. */
export function plainRules(list: Pick<ProhibitionList, "rules" | "register">): string {
  const lines = list.rules.map((r) => `${r.n}. ${r.text.replace(/\*\*/g, "")}`);
  if (list.register) lines.push(`Register: ${list.register}`);
  return lines.join("\n");
}
