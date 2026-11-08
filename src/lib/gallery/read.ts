import { isImageId } from "@/lib/images/door";
import { pyramid } from "@/lib/images/pyramid";
import type { Picture, Rendition, TileSet, Work } from "./types";

/**
 * From database rows to the gallery's shape. The select below names every column the gallery
 * reads; value, price, location, ownership, notes and the raw Airtable record are not among them,
 * and `toWork` copies only the fields of `Work` — so even a wider row could not leak through.
 *
 * Pictures come from their own query, the `gallery_pictures` view: one row per work, its best
 * source's size and stand-in, and the renditions cut from it. No storage address, no master id.
 */

export const WORK_COLUMNS = [
  "id",
  "title",
  "year",
  "year_text",
  "medium",
  "dimensions_unframed",
  "dimensions_framed",
  "edition",
  "acquired_on",
  "acquired_from",
  "status",
  "artists(display_name)",
].join(", ");

export const PICTURE_COLUMNS = "item_id, width, height, placeholder, renditions, tile_set";

export type WorkRow = {
  id: string;
  title: string | null;
  year: number | null;
  year_text: string | null;
  medium: string | null;
  dimensions_unframed: string | null;
  dimensions_framed: string | null;
  edition: string | null;
  acquired_on: string | null;
  acquired_from: string | null;
  status: string;
  artists: { display_name: string } | { display_name: string }[] | null;
};

export type PictureRow = {
  item_id: string;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  renditions: { id: string; format: string; width: number; height: number; long_side?: number }[] | null;
  tile_set?: { id: string; width: number; height: number; tile_size: number; tile_overlap: number; levels: number } | null;
};

/** A tile set the glass can open: a real id, a size, and a level count the pyramid rule agrees with. */
export function toTileSet(t: PictureRow["tile_set"]): TileSet | null {
  if (!t || !isImageId(t.id) || !(t.width > 0) || !(t.height > 0) || !(t.tile_size > 0) || !(t.tile_overlap >= 0) || !(t.levels > 0)) return null;
  if (pyramid(t.width, t.height, t.tile_size, t.tile_overlap).levels !== t.levels) return null;
  return { id: t.id, width: t.width, height: t.height, tileSize: t.tile_size, tileOverlap: t.tile_overlap, levels: t.levels };
}

const STAND_IN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** A picture the page can hang: at least one JPEG rendition, each rung with a real id, a known format and a size. */
export function toPicture(row: PictureRow | null | undefined): Picture | null {
  if (!row) return null;
  const renditions: Rendition[] = (row.renditions ?? [])
    .filter((r) => isImageId(r.id) && (r.format === "avif" || r.format === "jpeg") && r.width > 0 && r.height > 0)
    .map((r) => ({ id: r.id, format: r.format as Rendition["format"], width: r.width, height: r.height }));
  if (!renditions.some((r) => r.format === "jpeg")) return null;
  return {
    width: row.width,
    height: row.height,
    placeholder: row.placeholder && STAND_IN.test(row.placeholder) ? row.placeholder : null,
    renditions,
    tileSet: toTileSet(row.tile_set),
  };
}

export function toWork(r: WorkRow, picture: PictureRow | null = null): Work {
  const artist = Array.isArray(r.artists) ? r.artists[0] : r.artists;
  return {
    id: r.id,
    artist: artist?.display_name ?? null,
    title: r.title,
    year: r.year,
    yearText: r.year_text,
    medium: r.medium,
    dimensions: r.dimensions_unframed ?? r.dimensions_framed,
    edition: r.edition,
    acquiredOn: r.acquired_on ? r.acquired_on.slice(0, 10) : null,
    acquiredFrom: r.acquired_from,
    sold: r.status === "sold",
    picture: toPicture(picture),
  };
}
