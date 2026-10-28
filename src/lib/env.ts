/**
 * Environment for jobs that run outside Next.js (the ingest). Secrets live in one file on Workshop,
 * `~/curator/.env`, outside the iCloud-synced folder; locally, `.env.local`. Never in the repo.
 *
 * Order: an explicit CURATOR_ENV_FILE → ~/curator/.env → ./.env.local. Variables already set in
 * the process win over the file.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function loadEnvFile(): string | null {
  const candidates = [process.env.CURATOR_ENV_FILE, path.join(homedir(), "curator", ".env"), path.resolve(process.cwd(), ".env.local")].filter(
    (p): p is string => !!p,
  );
  const file = candidates.find((p) => existsSync(p));
  if (!file) return null;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const hash = value.search(/\s#/);
    if (hash >= 0 && !/^["']/.test(value)) value = value.slice(0, hash).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
  return file;
}

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Set it in ~/curator/.env on Workshop (never in chat, never in the repo).`);
  return v;
}
