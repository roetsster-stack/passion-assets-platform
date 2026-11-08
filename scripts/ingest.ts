/**
 * `npm run ingest` — bring the collection across from Airtable. Run on Workshop.
 *
 *   npm run ingest                      full run: records, ownership, provenance, pictures, documents,
 *                                       and the rendition ladder for every Airtable photograph
 *   npm run ingest -- --skip-attachments records only (fast; pictures and documents on a later run)
 *   npm run ingest -- --report          print what is in the register, change nothing
 *
 * Needs, in ~/curator/.env: DATABASE_URL, AIRTABLE_PAT, AIRTABLE_BASE_ID, R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_MASTERS, R2_BUCKET_RENDITIONS. Optional: CURATOR_COLLECTION_NAME,
 * R2_JURISDICTION ("eu" when the buckets were created in the EU jurisdiction).
 */
import { Client } from "pg";
import { sslFor } from "../src/lib/db";
import { loadEnvFile, required } from "../src/lib/env";
import { sharpRenderer } from "../src/lib/images/render";
import { createAirtableSource } from "../src/lib/ingest/airtable";
import { loadRules } from "../src/lib/ingest/rules";
import type { TileSetsCut } from "../src/lib/images/pictures";
import { runIngest, type Counts, type IngestReport } from "../src/lib/ingest/run";
import { createR2Store, parseR2Jurisdiction } from "../src/lib/ingest/storage";

const args = new Set(process.argv.slice(2));
const envFile = loadEnvFile();

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
  if (r.renditions) {
    console.log(`${"renditions".padEnd(12)} created ${String(r.renditions.created).padStart(4)}  unchanged ${String(r.renditions.unchanged).padStart(4)}`);
  }
  if (r.renditionErrors.length) {
    console.log(`rendition errors: ${r.renditionErrors.length} (re-run to retry)`);
    for (const e of r.renditionErrors.slice(0, 10)) console.log(`  image ${e.imageId}: ${e.error}`);
  }
  if (r.picturesMoved) console.log(`pictures: ${r.picturesMoved} work(s) now hang a better source`);
  if (r.tileSets) printTileSets(r.tileSets);
  if (r.pictures) {
    console.log(
      `works: ${r.pictures.withMaster} with a master, ${r.pictures.onSnapshot} on the Airtable snapshot, ${r.pictures.withoutPicture} with no picture yet; ${r.pictures.withGlass} open into the glass`,
    );
  }
}

function printTileSets(t: TileSetsCut) {
  console.log(`${"tile sets".padEnd(12)} created ${String(t.counts.created).padStart(4)}  unchanged ${String(t.counts.unchanged).padStart(4)}`);
  for (const c of t.cut) console.log(`  glass: ${c.label} — ${c.longSide} px, ${c.levels} levels`);
  if (t.errors.length) {
    console.log(`tile set errors: ${t.errors.length} (re-run to retry)`);
    for (const e of t.errors.slice(0, 10)) console.log(`  image ${e.imageId}: ${e.error}`);
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
  console.log(`  pictures     ${await q("select count(*) n from images where collection_id = $1 and kind = 'lowres_airtable'")} Airtable photographs`);
  console.log(`  masters      ${await q("select count(*) n from images where collection_id = $1 and kind = 'master'")}`);
  console.log(`  renditions   ${await q("select count(*) n from images where collection_id = $1 and kind = 'rendition'")}`);
  console.log(`  tile sets    ${await q("select count(*) n from images where collection_id = $1 and kind = 'tile_set'")}`);
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
      ? { exists: async () => false, putIfAbsent: async () => ({ written: false }), get: async () => Buffer.alloc(0) }
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
      ladder: skipAttachments ? undefined : { bucket: process.env.R2_BUCKET_RENDITIONS ?? "curator-renditions", renderer: sharpRenderer },
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
