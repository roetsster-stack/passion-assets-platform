/**
 * The tile pyramid (M1-02b): Deep Zoom (DZI) addressing, as sharp cuts it and OpenSeadragon reads
 * it — pure. Level 0 is one pixel; each level doubles; the top level is the source itself. Tiles
 * are 254 px with 1 px of overlap on every inner edge, so a tile is 256 px across in the middle
 * of the picture. Only a source of 4,000 px or more on its long side gets a pyramid: below that
 * the 4,320 rung of the ladder already shows every pixel.
 */

export const TILE_SIZE = 254;
export const TILE_OVERLAP = 1;
export const TILE_JPEG_QUALITY = 85;
export const TILES_MIN_LONG_SIDE = 4000;

/** A tile address lives thirty minutes: a zoom session lasts. */
export const TILE_URL_SECONDS = 1800;

export function needsTiles(longSide: number | null | undefined): boolean {
  return typeof longSide === "number" && longSide >= TILES_MIN_LONG_SIDE;
}

export type Pyramid = { width: number; height: number; tileSize: number; tileOverlap: number; maxLevel: number; levels: number };

/** The pyramid for a source of this size: the top level holds the source at full size. */
export function pyramid(width: number, height: number, tileSize = TILE_SIZE, tileOverlap = TILE_OVERLAP): Pyramid {
  const maxLevel = Math.max(0, Math.ceil(Math.log2(Math.max(1, width, height))));
  return { width, height, tileSize, tileOverlap, maxLevel, levels: maxLevel + 1 };
}

/** The picture's size at one level: halved, rounding up, once per level below the top. */
export function levelSize(p: Pyramid, level: number): { width: number; height: number } {
  const scale = 2 ** (p.maxLevel - level);
  return { width: Math.max(1, Math.ceil(p.width / scale)), height: Math.max(1, Math.ceil(p.height / scale)) };
}

/** How many tiles across and down at one level. */
export function tilesAt(p: Pyramid, level: number): { cols: number; rows: number } {
  const { width, height } = levelSize(p, level);
  return { cols: Math.ceil(width / p.tileSize), rows: Math.ceil(height / p.tileSize) };
}

/** Every tile in the pyramid, for cutting and for counting. */
export function allTiles(p: Pyramid): { level: number; x: number; y: number }[] {
  const out: { level: number; x: number; y: number }[] = [];
  for (let level = 0; level <= p.maxLevel; level++) {
    const { cols, rows } = tilesAt(p, level);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ level, x, y });
  }
  return out;
}

export type TileAddress = { level: number; x: number; y: number };

const DIGITS = /^(0|[1-9]\d{0,4})$/;
const TILE = /^(0|[1-9]\d{0,4})_(0|[1-9]\d{0,4})$/;

/** `["13", "3_2"]` → level 13, x 3, y 2. Anything else — a third part, a sign, a letter, a leading zero — is nothing. */
export function parseTile(parts: readonly string[]): TileAddress | null {
  if (parts.length !== 2 || !DIGITS.test(parts[0])) return null;
  const m = TILE.exec(parts[1]);
  if (!m) return null;
  return { level: Number(parts[0]), x: Number(m[1]), y: Number(m[2]) };
}

/** Is this tile in the pyramid? */
export function hasTile(p: Pyramid, t: TileAddress): boolean {
  if (t.level < 0 || t.level > p.maxLevel) return false;
  const { cols, rows } = tilesAt(p, t.level);
  return t.x >= 0 && t.x < cols && t.y >= 0 && t.y < rows;
}

/** Where one tile lives under the set's prefix. */
export function tileKey(prefix: string, t: TileAddress): string {
  return `${prefix}/${t.level}/${t.x}_${t.y}.jpg`;
}
