/** The commands' connection to the database (the ingest, the masters command). */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

/**
 * TLS to the database. Supabase's certificates chain to Supabase's own CA, so the first real run
 * needs that file: Supabase → Connect → "Download certificate" → save beside the env file and set
 * DATABASE_SSL_CA. There is no switch to skip verification: a register that knows where the works
 * are does not travel over a connection nobody has checked. DATABASE_SSL=disable is honoured only
 * for a local database.
 */
export function sslFor(url: string) {
  const hosted = /supabase\.(com|co)/.test(url) || /sslmode=require/.test(url);
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (process.env.DATABASE_SSL === "disable" && local) return undefined;
  if (!hosted && local) return undefined;
  if (process.env.DATABASE_SSL_CA) {
    const caPath = process.env.DATABASE_SSL_CA.replace(/^~(?=\/)/, homedir());
    return { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}
