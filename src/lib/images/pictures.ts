/**
 * The register's side of the ladder and the tiles, shared by `npm run ingest` and `npm run masters`
 * so the two commands always agree: cut a source's renditions into the renditions bucket, move each
 * work's picture (`is_hero`) to its best source, and cut the tile pyramid for every picture source
 * large enough for the glass. All idempotent — a second run writes nothing.
 *
 * The order matters: the ladder is cut first, and only then does the picture move. A master whose
 * file will not cut — or whose cut was interrupted — never becomes the picture; the Airtable
 * photograph stays until the master's ladder is whole. Tiles come last, for whatever hangs.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client } from "pg";
import type { ObjectStore } from "../ingest/storage";
import { FORMATS, ladderFor } from "./ladder";
import { allTiles, needsTiles, pyramid, TILE_OVERLAP, TILE_SIZE, tileKey, TILES_MIN_LONG_SIDE } from "./pyramid";
import type { Renderer } from "./render";
import { bestSource, type Source } from "./sources";

export type LadderCounts = { created: number; unchanged: number };
export type LadderError = { imageId: string; error: string };

export type SourceToCut = {
  id: string;
  collection_id: string;
  item_id: string;
  storage_bucket: string;
  storage_key: string;
  long_side: number | null;
  placeholder: string | null;
};

const CONTENT_TYPE = { avif: "image/avif", jpeg: "image/jpeg" } as const;
const EXT = { avif: "avif", jpeg: "jpg" } as const;

export function renditionKey(s: Pick<SourceToCut, "collection_id" | "item_id" | "id">, longSide: number, format: keyof typeof EXT): string {
  return `collections/${s.collection_id}/items/${s.item_id}/renditions/${s.id}/${longSide}.${EXT[format]}`;
}

/** Where a source's tiles live: `<prefix>/<level>/<x>_<y>.jpg`. */
export function tilePrefix(s: Pick<SourceToCut, "collection_id" | "item_id" | "id">): string {
  return `collections/${s.collection_id}/items/${s.item_id}/tiles/${s.id}`;
}

/** How many renditions a whole ladder has for a source of this size: every rung in every format. */
export function wholeLadder(longSide: number | null): number {
  return longSide ? ladderFor(longSide).length * FORMATS.length : 0;
}

/**
 * Cuts one source's ladder, unless it is already whole. Each rendition is written once (by its
 * key) and recorded once (one rung of one format per source); the source row learns its own size
 * and its stand-in last, so a source with a stand-in has a whole ladder.
 */
export async function cutLadder(
  db: Client,
  store: ObjectStore,
  renderer: Renderer,
  bucket: string,
  source: SourceToCut,
  counts: LadderCounts,
): Promise<void> {
  const have = await db.query<{ long_side: number; format: string }>(
    "select long_side, format from images where derived_from_image_id = $1 and kind = 'rendition'",
    [source.id],
  );
  const haveKeys = new Set(have.rows.map((r) => `${r.long_side}|${r.format}`));
  if (source.long_side && source.placeholder) {
    const want = ladderFor(source.long_side).flatMap((l) => FORMATS.map((f) => `${l}|${f}`));
    if (want.every((k) => haveKeys.has(k))) {
      counts.unchanged += want.length;
      return;
    }
  }

  const input = await store.get(source.storage_bucket, source.storage_key);
  const cut = await renderer.cut(input);
  for (const r of cut.renditions) {
    if (haveKeys.has(`${r.longSide}|${r.format}`)) {
      counts.unchanged++;
      continue;
    }
    const key = renditionKey(source, r.longSide, r.format);
    await store.putIfAbsent(bucket, key, r.body, CONTENT_TYPE[r.format]);
    const sha = createHash("sha256").update(r.body).digest("hex");
    await db.query(
      `insert into images (collection_id, item_id, kind, storage_bucket, storage_key, content_type, bytes, width, height, sha256, source, derived_from_image_id, long_side, format)
       values ($1, $2, 'rendition', $3, $4, $5, $6, $7, $8, $9, 'ladder', $10, $11, $12)
       on conflict do nothing`,
      [source.collection_id, source.item_id, bucket, key, CONTENT_TYPE[r.format], r.body.length, r.width, r.height, sha, source.id, r.longSide, r.format],
    );
    counts.created++;
  }
  await db.query(
    `update images set width = $2, height = $3, long_side = $4, placeholder = $5
     where id = $1 and (width is distinct from $2 or height is distinct from $3 or long_side is distinct from $4 or placeholder is distinct from $5)`,
    [source.id, cut.width, cut.height, Math.max(cut.width, cut.height), cut.placeholder],
  );
}

/** Cuts many sources, one at a time; a file that will not decode is reported and the run goes on. */
export async function cutLadders(
  db: Client,
  store: ObjectStore,
  renderer: Renderer,
  bucket: string,
  sources: SourceToCut[],
  log: (m: string) => void = () => {},
): Promise<{ counts: LadderCounts; errors: LadderError[] }> {
  const counts: LadderCounts = { created: 0, unchanged: 0 };
  const errors: LadderError[] = [];
  let n = 0;
  for (const s of sources) {
    const before = counts.created;
    try {
      await cutLadder(db, store, renderer, bucket, s, counts);
    } catch (err) {
      errors.push({ imageId: s.id, error: err instanceof Error ? err.message : String(err) });
    }
    if (counts.created > before && ++n % 10 === 0) log(`…${n} ladders cut`);
  }
  return { counts, errors };
}

const SOURCE_COLUMNS = ["id", "collection_id", "item_id", "storage_bucket", "storage_key", "long_side", "placeholder"] as const;

/** Every Airtable photograph of the works still in the source. */
export async function snapshotSources(db: Client, collectionId: string): Promise<SourceToCut[]> {
  const res = await db.query<SourceToCut>(
    `select ${SOURCE_COLUMNS.map((c) => `m.${c}`).join(", ")}
     from images m join items i on i.id = m.item_id
     where m.collection_id = $1 and m.kind = 'lowres_airtable' and i.source_removed_at is null
     order by i.id, m.sort_order, m.id`,
    [collectionId],
  );
  return res.rows;
}

/**
 * The master that would hang for each work that has one — the first flat capture — whether or
 * not its ladder is cut yet. These are cut before the pictures settle.
 */
export async function candidateMasterSources(db: Client, collectionId: string): Promise<SourceToCut[]> {
  const res = await db.query<SourceToCut & Source & { title: string | null }>(
    `select ${SOURCE_COLUMNS.map((c) => `m.${c}`).join(", ")}, m.kind, m.sort_order, m.original_filename, i.title
     from images m join items i on i.id = m.item_id
     where m.collection_id = $1 and m.kind = 'master'
     order by m.item_id, m.id`,
    [collectionId],
  );
  const byItem = new Map<string, typeof res.rows>();
  for (const r of res.rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  const out: SourceToCut[] = [];
  for (const rows of byItem.values()) {
    const best = bestSource(rows, { title: rows[0].title });
    if (best) out.push(Object.fromEntries(SOURCE_COLUMNS.map((c) => [c, best[c]])) as SourceToCut);
  }
  return out;
}

/**
 * Moves each work's picture to its best source: a master whose ladder is whole, else the Airtable
 * photograph. Returns how many works changed picture. The old picture keeps its row (and its
 * renditions); it is simply no longer the one that hangs.
 */
export async function settleHeroes(db: Client, collectionId: string): Promise<number> {
  const res = await db.query<Source & { item_id: string; is_hero: boolean; title: string | null; long_side: number | null; renditions: number }>(
    `select m.id, m.item_id, m.kind, m.sort_order, m.original_filename, m.is_hero, i.title, m.long_side,
            (select count(*) from images r where r.derived_from_image_id = m.id and r.kind = 'rendition')::int as renditions
     from images m join items i on i.id = m.item_id
     where m.collection_id = $1 and m.kind in ('master', 'lowres_airtable')`,
    [collectionId],
  );
  const byItem = new Map<string, typeof res.rows>();
  for (const r of res.rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  let moved = 0;
  for (const [itemId, rows] of byItem) {
    const sources = rows.map((r) => ({ ...r, cut: r.renditions >= wholeLadder(r.long_side) && r.renditions > 0 }));
    const best = bestSource(sources, { title: rows[0].title });
    const current = rows.filter((s) => s.is_hero);
    if (best && current.length === 1 && current[0].id === best.id) continue;
    if (!best && current.length === 0) continue;
    // Clear first: the database allows one picture per work at every moment.
    await db.query("update images set is_hero = false where item_id = $1 and is_hero and id is distinct from $2", [itemId, best?.id ?? null]);
    if (best) await db.query("update images set is_hero = true where id = $1 and not is_hero", [best.id]);
    moved++;
  }
  return moved;
}

export type PictureTally = { withMaster: number; onSnapshot: number; withoutPicture: number; withGlass: number };

/** How the works still in the register hang: their master, the Airtable snapshot, or nothing yet — and how many open into the glass. */
export async function pictureTally(db: Client, collectionId: string): Promise<PictureTally> {
  const res = await db.query<{ with_master: string; on_snapshot: string; without: string; with_glass: string }>(
    `select
       count(*) filter (where h.kind = 'master') as with_master,
       count(*) filter (where h.kind = 'lowres_airtable') as on_snapshot,
       count(*) filter (where h.id is null) as without,
       count(*) filter (where exists (select 1 from images t where t.derived_from_image_id = h.id and t.kind = 'tile_set')) as with_glass
     from items i left join images h on h.item_id = i.id and h.is_hero
     where i.collection_id = $1 and i.source_removed_at is null`,
    [collectionId],
  );
  const r = res.rows[0];
  return { withMaster: Number(r.with_master), onSnapshot: Number(r.on_snapshot), withoutPicture: Number(r.without), withGlass: Number(r.with_glass) };
}

// ---------------------------------------------------------------------------------------------
// The tiles

export type TileSource = SourceToCut & { width: number; height: number; label: string };

/**
 * The picture sources large enough for the glass: each work's picture — master or Airtable
 * photograph, whichever hangs — when it is 4,000 px or more on its long side.
 */
export async function tileSources(db: Client, collectionId: string): Promise<TileSource[]> {
  const res = await db.query<SourceToCut & { width: number; height: number; title: string | null; artist: string | null }>(
    `select ${SOURCE_COLUMNS.map((c) => `m.${c}`).join(", ")}, m.width, m.height, i.title, a.display_name as artist
     from images m join items i on i.id = m.item_id left join artists a on a.id = i.artist_id
     where m.collection_id = $1 and m.is_hero and m.kind in ('master', 'lowres_airtable')
       and m.long_side >= ${TILES_MIN_LONG_SIDE} and m.width is not null and m.height is not null
       and i.source_removed_at is null
     order by a.display_name, i.title`,
    [collectionId],
  );
  return res.rows.filter((r) => needsTiles(r.long_side)).map((r) => ({ ...r, label: [r.artist, r.title].filter(Boolean).join(", ") || r.item_id }));
}

/**
 * Cuts one source's pyramid into the renditions bucket and records it as one tile_set row —
 * unless the row is already there. The row is written last, after every tile, so a run cut short
 * leaves no set that is not whole; the next run cuts it again (tiles already in the bucket stay).
 */
export async function cutTileSet(
  db: Client,
  store: ObjectStore,
  renderer: Renderer,
  bucket: string,
  source: TileSource,
  counts: LadderCounts,
): Promise<boolean> {
  const have = await db.query("select 1 from images where derived_from_image_id = $1 and kind = 'tile_set'", [source.id]);
  if (have.rowCount) {
    counts.unchanged++;
    return false;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "curator-tiles-"));
  try {
    const input = await store.get(source.storage_bucket, source.storage_key);
    const cut = await renderer.tiles(input, dir);
    const p = pyramid(cut.width, cut.height);
    const levelsOnDisk = readdirSync(cut.filesDir).filter((n) => /^\d+$/.test(n)).length;
    if (levelsOnDisk !== p.levels) throw new Error(`the pyramid on disk has ${levelsOnDisk} levels; the rule says ${p.levels}`);
    const prefix = tilePrefix(source);
    const tiles = allTiles(p);
    // Every tile must be on disk before any is stored: a set is whole or it is nothing.
    const files = tiles.map((t) => {
      const file = [".jpeg", ".jpg"].map((e) => path.join(cut.filesDir, String(t.level), `${t.x}_${t.y}${e}`)).find(existsSync);
      if (!file) throw new Error(`tile ${t.level}/${t.x}_${t.y} was not cut`);
      return file;
    });
    let bytes = 0;
    // A pyramid is hundreds of small objects; a few in flight at once, or a set takes minutes from Workshop.
    await inParallel(tiles, TILE_UPLOADS_IN_FLIGHT, async (t, i) => {
      const body = readFileSync(files[i]);
      await store.putIfAbsent(bucket, tileKey(prefix, t), body, "image/jpeg");
      bytes += body.length;
    });
    await db.query(
      `insert into images (collection_id, item_id, kind, storage_bucket, storage_key, content_type, bytes, width, height, long_side, source, derived_from_image_id, tile_size, tile_overlap, levels, is_hero, sort_order)
       values ($1, $2, 'tile_set', $3, $4, 'image/jpeg', $5, $6, $7, $8, 'tiles', $9, $10, $11, $12, false, 0)
       on conflict do nothing`,
      [source.collection_id, source.item_id, bucket, prefix, bytes, cut.width, cut.height, Math.max(cut.width, cut.height), source.id, TILE_SIZE, TILE_OVERLAP, p.levels],
    );
    counts.created++;
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TILE_UPLOADS_IN_FLIGHT = 8;

async function inParallel<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export type TileSetsCut = { counts: LadderCounts; errors: LadderError[]; cut: { label: string; longSide: number; levels: number }[] };

/** Cuts the pyramid for every picture source large enough; a source that will not cut is reported and the run goes on. */
export async function cutTileSets(
  db: Client,
  store: ObjectStore,
  renderer: Renderer,
  bucket: string,
  collectionId: string,
  log: (m: string) => void = () => {},
): Promise<TileSetsCut> {
  const result: TileSetsCut = { counts: { created: 0, unchanged: 0 }, errors: [], cut: [] };
  for (const s of await tileSources(db, collectionId)) {
    try {
      if (await cutTileSet(db, store, renderer, bucket, s, result.counts)) {
        const p = pyramid(s.width, s.height);
        result.cut.push({ label: s.label, longSide: Math.max(s.width, s.height), levels: p.levels });
        log(`glass: ${s.label} — ${Math.max(s.width, s.height)} px, ${p.levels} levels`);
      }
    } catch (err) {
      result.errors.push({ imageId: s.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
