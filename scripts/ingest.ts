/**
 * `npm run ingest` — bring the collection across from Airtable. Run on Workshop.
 *
 *   npm run ingest                      full run: records, ownership, provenance, pictures, documents
 *   npm run ingest -- --skip-attachments records only (fast; pictures and documents on a later run)
 *   npm run ingest -- --report          print what is in the register, change nothing
 *
 * Needs, in ~/curator/.env: DATABASE_URL, AIRTABLE_PAT, AIRTABLE_BASE_ID, R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_MASTERS. Optional: CURATOR_COLLECTION_NAME,
 * R2_JURISDICTION ("eu" when the buckets were created in the EU jurisdiction).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Client } from "pg";
import { loadEnvFile, required } from "../src/lib/env";
import { createAirtableSource } from "../src/lib/ingest/airtable";
import { loadRules } from "../src/lib/ingest/rules";
import { runIngest, type Counts, type IngestReport } from "../src/lib/ingest/run";
import { createR2Store, parseR2Jurisdiction } from "../src/lib/ingest/storage";

const args = new Set(process.argv.slice(2));
const envFile = loadEnvFile();

/**
 * TLS to the database. Supabase's certificates chain to Supabase's own CA, so the first real run
 * needs that file: Supabase → Connect → "Download certificate" → save beside the env file and set
 * DATABASE_SSL_CA. There is no switch to skip verification: a register that knows where the works
 * are does not travel over a connection nobody has checked. DATABASE_SSL=disable is honoured only
 * for a local database.
 */
function sslFor(url: string) {
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

function line(label: string, c: Counts) {
  return `${label.padEnd(12)} created ${String(c.created).padStart(4)}  updated ${String(c.updated).padStart(4)}  unchanged ${String(c.unchanged).padStart(4)}  removed ${String(c.removed).padStart(4)}`;
}

function printReport(r: IngestReport) {
  console.log("");
  console.log(`Ingest run ${r.runId} · ${(r.durationMs / 1000).toFixed(1)}s`);
  console.log(line("artists", r.artists));
  console.log(line("works", r.items));
  console.log(line("ownership", r.ownership));
  console.log(line("provenance", r.provenance));
  console.log(line("pictures", r.images));
  console.log(line("documents", r.documents));
  console.log(`flagged for review: ${r.flagged} work(s) carry a note in admin_notes`);
  if (r.ownerDefaulted) console.log(`ownership: ${r.ownerDefaulted} work(s) had no Ownership in Airtable and were recorded as the default owner`);
  if (r.provenanceDropped) console.log(`provenance: ${r.provenanceDropped} record(s) had no label or no linked work and were not brought across`);
  if (r.items.removed) console.log(`withdrawn: ${r.items.removed} work(s) are no longer in Airtable and are marked withdrawn here (nothing deleted)`);
  if (r.attachmentErrors.length) {
    console.log(`attachment errors: ${r.attachmentErrors.length} (re-run to retry)`);
    for (const e of r.attachmentErrors.slice(0, 10)) console.log(`  ${e.itemRecordId} ${e.attachmentId}: ${e.error}`);
  }
}

async function report(db: Client, collectionName: string) {
  const c = await db.query<{ id: string }>("select id from collections where name = $1", [collectionName]);
  if (!c.rows[0]) {
    console.log(`No collection named "${collectionName}" yet. Run the ingest first.`);
    return;
  }
  const cid = c.rows[0].id;
  const q = async (sql: string) => (await db.query<{ n: string }>(sql, [cid])).rows[0].n;
  console.log(`Collection "${collectionName}" (${cid})`);
  console.log(`  works        ${await q("select count(*) n from items where collection_id = $1")}`);
  console.log(`  sold         ${await q("select count(*) n from items where collection_id = $1 and status = 'sold'")}`);
  console.log(`  artists      ${await q("select count(*) n from artists where collection_id = $1")}`);
  console.log(`  provenance   ${await q("select count(*) n from provenance_events where collection_id = $1")}`);
  console.log(`  pictures     ${await q("select count(*) n from images where collection_id = $1")}`);
  console.log(`  documents    ${await q("select count(*) n from documents where collection_id = $1")}`);
  console.log(`  flagged      ${await q("select count(*) n from items where collection_id = $1 and admin_notes is not null")}`);
  console.log(`  withdrawn    ${await q("select count(*) n from items where collection_id = $1 and source_removed_at is not null")}`);
  const runs = await db.query<{ started_at: Date; status: string; counts: unknown }>(
    "select started_at, status, counts from ingest_runs where collection_id = $1 order by started_at desc limit 5",
    [cid],
  );
  console.log("  last runs:");
  for (const r of runs.rows) console.log(`    ${r.started_at.toISOString()} ${r.status}`);
}

async function main() {
  const collectionName = process.env.CURATOR_COLLECTION_NAME ?? "Michael Roets Collection";
  const databaseUrl = required("DATABASE_URL");
  const db = new Client({ connectionString: databaseUrl, ssl: sslFor(databaseUrl) });
  await db.connect();
  try {
    if (envFile) console.log(`env: ${envFile}`);
    if (args.has("--report")) {
      await report(db, collectionName);
      return;
    }
    const { rules, file: rulesFile } = loadRules();
    console.log(`rules: ${rulesFile}`);
    const source = createAirtableSource({ baseId: required("AIRTABLE_BASE_ID"), token: required("AIRTABLE_PAT") });
    const skipAttachments = args.has("--skip-attachments");
    const store = skipAttachments
      ? { exists: async () => false, putIfAbsent: async () => ({ written: false }) }
      : createR2Store({
          accountId: required("R2_ACCOUNT_ID"),
          accessKeyId: required("R2_ACCESS_KEY_ID"),
          secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
          jurisdiction: parseR2Jurisdiction(process.env.R2_JURISDICTION),
        });
    const result = await runIngest({
      db,
      source,
      store,
      rules,
      collectionName,
      mastersBucket: process.env.R2_BUCKET_MASTERS ?? "curator-masters",
      skipAttachments,
      log: (m) => console.log(m),
    });
    printReport(result);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
