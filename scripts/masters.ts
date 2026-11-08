/**
 * `npm run masters` — the archival capture comes in. Run on Workshop.
 *
 *   npm run masters -- --prepare          one folder per work under ~/curator/masters/ (existing ones kept)
 *   npm run masters -- --from <folder>    copy the files in <folder> (e.g. the Dropbox sync) into the
 *                                         right work folders; every file it cannot place is listed
 *   npm run masters -- --report           what is in the folders, and what is in the archive
 *   npm run masters                       take everything in the work folders into the archive: each
 *                                         master stored once, its ladder cut, then the work's picture moved to it
 *
 * Needs, in ~/curator/.env: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_MASTERS, R2_BUCKET_RENDITIONS; optional R2_JURISDICTION, CURATOR_COLLECTION_NAME and
 * CURATOR_MASTERS_DIR (default ~/curator/masters). --from needs no database and no keys.
 */
import { homedir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { sslFor } from "../src/lib/db";
import { loadEnvFile, required } from "../src/lib/env";
import { folderReport, loadMasterWorks, prepareFolders, runMasters, sortFrom } from "../src/lib/images/masters-run";
import { sharpRenderer } from "../src/lib/images/render";
import { createR2Store, parseR2Jurisdiction } from "../src/lib/ingest/storage";

const argv = process.argv.slice(2);
const args = new Set(argv);
loadEnvFile();

const expand = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, homedir()));
const root = expand(process.env.CURATOR_MASTERS_DIR ?? "~/curator/masters");
const collectionName = process.env.CURATOR_COLLECTION_NAME ?? "Michael Roets Collection";

async function withDb<T>(fn: (db: Client, collectionId: string) => Promise<T>): Promise<T> {
  const url = required("DATABASE_URL");
  const db = new Client({ connectionString: url, ssl: sslFor(url) });
  await db.connect();
  try {
    await db.query("select set_config('app.actor', 'masters', false)");
    const c = await db.query<{ id: string }>("select id from collections where name = $1", [collectionName]);
    if (!c.rows[0]) throw new Error(`No collection named "${collectionName}". Run npm run ingest first.`);
    return await fn(db, c.rows[0].id);
  } finally {
    await db.end();
  }
}

async function main() {
  console.log(`masters folder: ${root}`);

  if (args.has("--prepare")) {
    const r = await withDb(async (db, cid) => prepareFolders(root, await loadMasterWorks(db, cid)));
    console.log(`work folders: ${r.created.length} created, ${r.kept} already there (${r.folders.length} works)`);
    for (const f of r.created) console.log(`  + ${f}`);
    return;
  }

  const fromAt = argv.indexOf("--from");
  if (fromAt >= 0) {
    const from = argv[fromAt + 1];
    if (!from) throw new Error("--from needs a folder: npm run masters -- --from <folder>");
    const r = sortFrom(root, expand(from));
    console.log(`from ${expand(from)}`);
    console.log(`copied ${r.copied.length}, already in their folders ${r.alreadyThere}, not placed ${r.unplaced.length}`);
    for (const c of r.copied) console.log(`  ${c.file}\n      -> ${c.folder}`);
    if (r.unplaced.length) {
      console.log("not placed — rename with the artist's surname and the title, or drag into the folder by hand:");
      for (const u of r.unplaced) console.log(`  ${u.file}\n      ${u.why}`);
    }
    return;
  }

  if (args.has("--report")) {
    await withDb(async (db, cid) => {
      const r = await folderReport(db, root, cid);
      const withFiles = r.lines.filter((l) => l.files > 0);
      console.log(`${r.lines.length} work folders; ${withFiles.length} hold files`);
      for (const l of withFiles) console.log(`  ${String(l.files).padStart(3)} file(s), ${String(l.inArchive).padStart(3)} in the archive  ${l.folder}`);
      if (r.loose.length) {
        console.log(`loose files, not in a work folder (${r.loose.length}) — npm run masters -- --from "${root}" places them:`);
        for (const f of r.loose) console.log(`  ${f}`);
      }
      if (r.unmarked.length) {
        console.log(`folders named like work folders with no readable marker (${r.unmarked.length}) — --prepare will refuse until these are restored or moved aside:`);
        for (const f of r.unmarked) console.log(`  ${f}`);
      }
      console.log(
        `works: ${r.tally.withMaster} with a master, ${r.tally.onSnapshot} on the Airtable snapshot, ${r.tally.withoutPicture} with no picture yet; ${r.tally.withGlass} open into the glass`,
      );
    });
    return;
  }

  const store = createR2Store({
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    jurisdiction: parseR2Jurisdiction(process.env.R2_JURISDICTION),
  });
  console.log("Taking the masters in…");
  const r = await withDb((db, collectionId) =>
    runMasters({
      db,
      store,
      renderer: sharpRenderer,
      root,
      collectionId,
      mastersBucket: process.env.R2_BUCKET_MASTERS ?? "curator-masters",
      renditionsBucket: process.env.R2_BUCKET_RENDITIONS ?? "curator-renditions",
      log: (m) => console.log(m),
    }),
  );
  console.log("");
  console.log(`masters      created ${String(r.masters.created).padStart(4)}  unchanged ${String(r.masters.unchanged).padStart(4)}`);
  console.log(`renditions   created ${String(r.renditions.created).padStart(4)}  unchanged ${String(r.renditions.unchanged).padStart(4)}`);
  if (r.picturesMoved) console.log(`pictures: ${r.picturesMoved} work(s) now hang their master`);
  console.log(`tile sets    created ${String(r.tileSets.counts.created).padStart(4)}  unchanged ${String(r.tileSets.counts.unchanged).padStart(4)}`);
  for (const c of r.tileSets.cut) console.log(`  glass: ${c.label} — ${c.longSide} px, ${c.levels} levels`);
  if (r.tileSets.errors.length) {
    console.log(`tile set errors: ${r.tileSets.errors.length} (re-run to retry)`);
    for (const e of r.tileSets.errors.slice(0, 10)) console.log(`  image ${e.imageId}: ${e.error}`);
  }
  console.log(
    `works: ${r.pictures.withMaster} with a master, ${r.pictures.onSnapshot} on the Airtable snapshot, ${r.pictures.withoutPicture} with no picture yet; ${r.pictures.withGlass} open into the glass`,
  );
  if (r.skipped.length) {
    console.log(`not taken (${r.skipped.length}):`);
    for (const s of r.skipped) console.log(`  ${s.file} — ${s.why}`);
  }
  if (r.orphanFolders.length) console.log(`folders for works the register does not have: ${r.orphanFolders.join(", ")}`);
  if (r.renditionErrors.length) {
    console.log(`rendition errors: ${r.renditionErrors.length} (re-run to retry)`);
    for (const e of r.renditionErrors.slice(0, 10)) console.log(`  image ${e.imageId}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
