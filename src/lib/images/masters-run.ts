/**
 * `npm run masters` — the archival capture comes in. The folders, the sorting, and the run itself.
 *
 * A master is stored once (its key is its SHA-256), write-once, in the masters bucket, as kind
 * `master` — a kind no door serves and no signed-in session can even read. Each work's picture
 * moves to its best master; the Airtable snapshot keeps its row, no longer the picture. The ladder
 * is then cut from that master. Nothing here deletes a file — not from the folders, not from the
 * source being sorted, not from the bucket.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "pg";
import type { ObjectStore } from "../ingest/storage";
import { MARKER, MASTER_TYPES, PICTURE_LIKE, placeFile, planFolders, type Marker, type MasterWork } from "./masters";
import { cutLadders, heroMasterSources, pictureTally, settleHeroes, type LadderCounts, type LadderError, type PictureTally } from "./pictures";
import type { Renderer } from "./render";

const README = `masters — one folder per work. Drop the photographer's or gallery's files for a work into its folder.
Folder names: NNN-Surname-Title (alphabetical by artist). _INDEX.csv lists every folder with the full title and the Airtable id.
Each folder holds a hidden marker (${MARKER}) — leave it. Then, in Terminal, in the project:
  npm run masters -- --from <folder>   copies files from another folder (Dropbox, a download) into the right work folders
  npm run masters                      takes everything in the work folders into the archive and cuts the ladder
  npm run masters -- --report          says what is here and what is in the archive
Never rename the folders by hand; never delete the marker. Nothing here syncs to iCloud — by design.
`;

// ---------------------------------------------------------------------------------------------
// The folders

/** The works as the register knows them, for preparing folders. */
export async function loadMasterWorks(db: Client, collectionId: string): Promise<MasterWork[]> {
  const res = await db.query<{ airtable_record_id: string; display_name: string | null; surname: string | null; title: string | null; year_text: string | null; year: number | null }>(
    `select i.airtable_record_id, a.display_name, a.surname, i.title, i.year_text, i.year
     from items i left join artists a on a.id = i.artist_id
     where i.collection_id = $1 and i.airtable_record_id is not null and i.source_removed_at is null`,
    [collectionId],
  );
  return res.rows.map((r) => ({
    recordId: r.airtable_record_id,
    artist: r.display_name ?? "",
    surname: r.surname ?? r.display_name ?? "",
    title: r.title ?? "Untitled",
    year: r.year_text ?? (r.year ? String(r.year) : ""),
  }));
}

/** Every work folder under `root`, by the marker inside it. */
export function readMarkers(root: string): Marker[] {
  if (!existsSync(root)) return [];
  const out: Marker[] = [];
  for (const name of readdirSync(root)) {
    const marker = path.join(root, name, MARKER);
    if (!existsSync(marker)) continue;
    try {
      const j = JSON.parse(readFileSync(marker, "utf8")) as Record<string, string>;
      if (!j.airtable_record_id) continue;
      out.push({ recordId: j.airtable_record_id, artist: j.artist ?? "", surname: j.surname ?? "", title: j.title ?? "", year: j.year ?? "", folder: name });
    } catch {
      // a marker that does not parse is reported by --report as a folder with no work
    }
  }
  return out;
}

export type PrepareResult = { created: string[]; kept: number; folders: string[] };

export function prepareFolders(root: string, works: MasterWork[], now = new Date()): PrepareResult {
  mkdirSync(root, { recursive: true });
  const existing = new Map(readMarkers(root).map((m) => [m.recordId, m.folder]));
  const plan = planFolders(works, existing);
  const created: string[] = [];
  for (const { work, folder, isNew } of plan) {
    if (!isNew) continue;
    mkdirSync(path.join(root, folder), { recursive: true });
    writeFileSync(
      path.join(root, folder, MARKER),
      JSON.stringify(
        {
          airtable_record_id: work.recordId,
          artist: work.artist,
          surname: work.surname,
          title: work.title,
          year: work.year,
          folder,
          created_by: "npm run masters -- --prepare",
          created_at: now.toISOString(),
          note: "Drop the photographer's or gallery's files for this work in this folder. Keep this marker file; the masters tool reads it.",
        },
        null,
        2,
      ) + "\n",
    );
    created.push(folder);
  }
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["folder,artist,title,year,airtable_record_id", ...plan.map(({ work, folder }) => [folder, work.artist, work.title, work.year, work.recordId].map(q).join(","))];
  writeFileSync(path.join(root, "_INDEX.csv"), csv.join("\n") + "\n");
  writeFileSync(path.join(root, "README.txt"), README);
  return { created, kept: plan.length - created.length, folders: plan.map((p) => p.folder) };
}

// ---------------------------------------------------------------------------------------------
// Sorting files in from elsewhere

export type SortResult = {
  copied: { file: string; folder: string }[];
  alreadyThere: number;
  unplaced: { file: string; why: string }[];
};

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const r = rel ? path.join(rel, name) : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, r));
    else out.push(r);
  }
  return out;
}

/**
 * Copies every picture under `from` into its work's folder. Copies, never moves: the source may be
 * a synced folder (Dropbox) where a move would be a deletion. A file already in its folder under
 * the same name and size is left alone; a different file with the same name is kept beside it.
 */
export function sortFrom(root: string, from: string): SortResult {
  const works = readMarkers(root);
  const result: SortResult = { copied: [], alreadyThere: 0, unplaced: [] };
  if (!works.length) throw new Error(`No prepared folders in ${root}. Run npm run masters -- --prepare first.`);
  const fromAbs = path.resolve(from);
  // When the folder being sorted lives inside the masters folder, its own work folders are home already.
  const workFolders = new Set(works.map((w) => path.join(root, w.folder)));
  for (const rel of walk(fromAbs)) {
    const abs = path.join(fromAbs, rel);
    if ([...workFolders].some((f) => abs.startsWith(f + path.sep))) continue;
    const ext = path.extname(rel).toLowerCase();
    if (!PICTURE_LIKE.has(ext)) continue;
    const place = placeFile(rel, works);
    if (place.status === "no-artist") {
      result.unplaced.push({ file: rel, why: "no artist recognised in the name" });
      continue;
    }
    if (place.status === "ambiguous") {
      result.unplaced.push({ file: rel, why: `the title does not decide between ${place.candidates.map((c) => c.folder).join(", ")}` });
      continue;
    }
    const destDir = path.join(root, place.work.folder);
    let dest = path.join(destDir, path.basename(rel));
    const size = statSync(abs).size;
    if (existsSync(dest)) {
      if (statSync(dest).size === size) {
        result.alreadyThere++;
        continue;
      }
      const e = path.extname(dest);
      let i = 2;
      while (existsSync(dest)) dest = path.join(destDir, `${path.basename(rel, e)}-${i++}${e}`);
    }
    copyFileSync(abs, dest);
    result.copied.push({ file: rel, folder: place.work.folder });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// The run: masters into the archive, the picture moved, the ladder cut

export type MastersReport = {
  masters: { created: number; unchanged: number };
  /** Files in work folders that are not taken: not a format the archive takes, or unreadable. */
  skipped: { file: string; why: string }[];
  /** Folders whose marker names a work the register does not have. */
  orphanFolders: string[];
  picturesMoved: number;
  renditions: LadderCounts;
  renditionErrors: LadderError[];
  pictures: PictureTally;
};

export type MastersDeps = {
  db: Client;
  store: ObjectStore;
  renderer: Renderer;
  root: string;
  collectionId: string;
  mastersBucket: string;
  renditionsBucket: string;
  log?: (m: string) => void;
};

export function masterKey(collectionId: string, itemId: string, sha: string, ext: string): string {
  return `collections/${collectionId}/items/${itemId}/masters/${sha}${ext}`;
}

export async function runMasters(deps: MastersDeps): Promise<MastersReport> {
  const { db, store, renderer, root, collectionId } = deps;
  const log = deps.log ?? (() => {});
  const report: MastersReport = {
    masters: { created: 0, unchanged: 0 },
    skipped: [],
    orphanFolders: [],
    picturesMoved: 0,
    renditions: { created: 0, unchanged: 0 },
    renditionErrors: [],
    pictures: { withMaster: 0, onSnapshot: 0, withoutPicture: 0 },
  };

  const items = await db.query<{ id: string; airtable_record_id: string }>(
    "select id, airtable_record_id from items where collection_id = $1 and airtable_record_id is not null",
    [collectionId],
  );
  const itemOf = new Map(items.rows.map((r) => [r.airtable_record_id, r.id]));
  const have = await db.query<{ item_id: string; sha256: string }>("select item_id, sha256 from images where collection_id = $1 and kind = 'master'", [collectionId]);
  const known = new Set(have.rows.map((r) => `${r.item_id}|${r.sha256}`));

  for (const m of readMarkers(root)) {
    const itemId = itemOf.get(m.recordId);
    if (!itemId) {
      report.orphanFolders.push(m.folder);
      continue;
    }
    for (const rel of walk(path.join(root, m.folder))) {
      const file = path.join(m.folder, rel);
      const ext = path.extname(rel).toLowerCase();
      const contentType = MASTER_TYPES[ext];
      if (!contentType) {
        if (ext !== ".json" && ext !== ".txt") report.skipped.push({ file, why: ext === ".zip" ? "a zip — unpack it into the folder" : `not a format the archive takes (${ext || "no extension"})` });
        continue;
      }
      const body = readFileSync(path.join(root, m.folder, rel));
      const sha = createHash("sha256").update(body).digest("hex");
      // The same bytes for the same work are one master, whatever the file is called.
      if (known.has(`${itemId}|${sha}`)) {
        report.masters.unchanged++;
        continue;
      }
      let size: { width: number; height: number };
      try {
        size = await renderer.probe(body);
      } catch (err) {
        report.skipped.push({ file, why: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
      const key = masterKey(collectionId, itemId, sha, ext === ".jpeg" ? ".jpg" : ext === ".tiff" ? ".tif" : ext);
      await store.putIfAbsent(deps.mastersBucket, key, body, contentType);
      await db.query(
        `insert into images (collection_id, item_id, kind, storage_bucket, storage_key, content_type, bytes, width, height, long_side, sha256, source, original_filename, is_hero, sort_order)
         values ($1, $2, 'master', $3, $4, $5, $6, $7, $8, $9, $10, 'masters', $11, false, 0)
         on conflict (storage_bucket, storage_key) do nothing`,
        [collectionId, itemId, deps.mastersBucket, key, contentType, body.length, size.width, size.height, Math.max(size.width, size.height), sha, path.basename(rel)],
      );
      known.add(`${itemId}|${sha}`);
      report.masters.created++;
      log(`master: ${file}`);
    }
  }

  report.picturesMoved = await settleHeroes(db, collectionId);
  const sources = await heroMasterSources(db, collectionId);
  if (sources.length) log(`Cutting the ladder for ${sources.length} master(s)…`);
  const cut = await cutLadders(db, store, renderer, deps.renditionsBucket, sources, log);
  report.renditions = cut.counts;
  report.renditionErrors = cut.errors;
  report.pictures = await pictureTally(db, collectionId);
  return report;
}

// ---------------------------------------------------------------------------------------------
// The report: what is in the folders, what is in the archive

export type FolderLine = { folder: string; files: number; inArchive: number };

export async function folderReport(db: Client, root: string, collectionId: string): Promise<{ lines: FolderLine[]; loose: string[]; tally: PictureTally }> {
  const markers = readMarkers(root);
  const items = await db.query<{ id: string; airtable_record_id: string }>("select id, airtable_record_id from items where collection_id = $1", [collectionId]);
  const itemOf = new Map(items.rows.map((r) => [r.airtable_record_id, r.id]));
  const masters = await db.query<{ item_id: string; n: string }>(
    "select item_id, count(*) n from images where collection_id = $1 and kind = 'master' group by item_id",
    [collectionId],
  );
  const archived = new Map(masters.rows.map((r) => [r.item_id, Number(r.n)]));
  const lines = markers
    .map((m) => ({
      folder: m.folder,
      files: walk(path.join(root, m.folder)).filter((f) => MASTER_TYPES[path.extname(f).toLowerCase()]).length,
      inArchive: archived.get(itemOf.get(m.recordId) ?? "") ?? 0,
    }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
  const workFolders = new Set(markers.map((m) => m.folder));
  const loose = existsSync(root)
    ? walk(root).filter((f) => !workFolders.has(f.split(path.sep)[0]) && PICTURE_LIKE.has(path.extname(f).toLowerCase()))
    : [];
  return { lines, loose, tally: await pictureTally(db, collectionId) };
}
