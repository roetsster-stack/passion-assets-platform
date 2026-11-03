/**
 * The rendition ladder (M1-02a): the sizes cut for a source, on its long side. Pure.
 *
 *   480 · 1,080 · 2,160 · 4,320 — each only if the source is at least that size. Never upscaled:
 *   when the source falls between two rungs, its own size is the top rung. A 1,071 px photograph
 *   yields 480 and 1,071, nothing larger; a 300 px one yields 300 alone.
 */

export const RUNGS = [480, 1080, 2160, 4320] as const;

/** When the browser says it is saving data, the ladder stops here. */
export const SAVE_DATA_CAP = 1080;

export const FORMATS = ["avif", "jpeg"] as const;
export type Format = (typeof FORMATS)[number];

export const JPEG_QUALITY = 82;
export const AVIF_QUALITY = 50;
export const AVIF_EFFORT = 4;
/** The stand-in: drawn beneath the picture, in the HTML, before any file arrives. */
export const STAND_IN_LONG_SIDE = 24;
export const STAND_IN_JPEG_QUALITY = 40;

export function ladderFor(sourceLongSide: number): number[] {
  if (!Number.isFinite(sourceLongSide) || sourceLongSide < 1) return [];
  const side = Math.floor(sourceLongSide);
  const rungs: number[] = RUNGS.filter((r) => r <= side);
  const top = RUNGS[RUNGS.length - 1];
  // The source's own size, when it falls between rungs (or below the first). Above the top rung
  // the ladder stops at 4,320: the master itself is never a rendition.
  if (side < top && !rungs.includes(side)) rungs.push(side);
  return rungs;
}

/** The pixel size of a rung for a source of this shape: the long side scaled, the short side in proportion. */
export function rungSize(source: { width: number; height: number }, longSide: number): { width: number; height: number } {
  const scale = longSide / Math.max(source.width, source.height);
  if (source.width >= source.height) return { width: longSide, height: Math.max(1, Math.round(source.height * scale)) };
  return { width: Math.max(1, Math.round(source.width * scale)), height: longSide };
}
