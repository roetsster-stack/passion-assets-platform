import { hasTile, parseTile, pyramid, tileKey } from "./pyramid";

/**
 * The tile door's decision, as a pure function. `/t/<set>/<level>/<x>_<y>` answers in exactly two
 * ways: a redirect to a signed address that dies in thirty minutes, or 404. No session, a row that
 * row-level security does not return for this person, a row that is not a tile set (a master above
 * all, a rendition, the Airtable snapshot), an address outside the pyramid — all 404, and
 * indistinguishable, so the door says nothing about what exists.
 */

export type TileSetRow = {
  kind: string;
  storage_bucket: string;
  storage_key: string;
  width: number | null;
  height: number | null;
  tile_size: number | null;
  tile_overlap: number | null;
  levels: number | null;
};

export type TileDecision = { kind: "not-found" } | { kind: "sign"; bucket: string; key: string };

export function decideTile(s: { signedIn: boolean; row: TileSetRow | null; tile: readonly string[] }): TileDecision {
  if (!s.signedIn || !s.row || s.row.kind !== "tile_set") return { kind: "not-found" };
  const { width, height, tile_size, tile_overlap, levels } = s.row;
  if (!width || !height || !tile_size || tile_overlap === null || !levels) return { kind: "not-found" };
  const t = parseTile(s.tile);
  if (!t) return { kind: "not-found" };
  const p = pyramid(width, height, tile_size, tile_overlap);
  // The row says how many levels were cut; the pyramid rule must agree, or the set is not whole.
  if (p.levels !== levels || !hasTile(p, t)) return { kind: "not-found" };
  return { kind: "sign", bucket: s.row.storage_bucket, key: tileKey(s.row.storage_key, t) };
}
