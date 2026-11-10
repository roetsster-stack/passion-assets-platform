/**
 * M1-02b · the tile pyramid: the ≥ 4,000 px rule, Deep Zoom's levels and tile counts, the address
 * of a tile — and that what sharp cuts on disk is exactly what the rule says, since the tile door
 * refuses any address the rule does not name. Synthetic pictures only.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  allTiles,
  hasTile,
  levelSize,
  needsTiles,
  parseTile,
  pyramid,
  TILE_OVERLAP,
  TILE_SIZE,
  TILE_URL_SECONDS,
  tileKey,
  TILES_MIN_LONG_SIDE,
  tilesAt,
} from "@/lib/images/pyramid";
import { tiles } from "@/lib/images/render";

describe("the ≥ 4,000 px rule", () => {
  it("a source of 4,000 px or more on its long side gets a pyramid; anything less has the ladder's 4,320 rung already", () => {
    expect(TILES_MIN_LONG_SIDE).toBe(4000);
    expect(needsTiles(5375)).toBe(true);
    expect(needsTiles(4000)).toBe(true);
    expect(needsTiles(3999)).toBe(false);
    expect(needsTiles(null)).toBe(false);
    expect(needsTiles(undefined)).toBe(false);
  });
});

describe("the pyramid", () => {
  it("254 px tiles with 1 px of overlap; an address lives thirty minutes", () => {
    expect(TILE_SIZE).toBe(254);
    expect(TILE_OVERLAP).toBe(1);
    expect(TILE_URL_SECONDS).toBe(1800);
  });

  it("the Kentridge, 5,375 × 4,000: fourteen levels, 22 × 16 tiles at the top, one at the bottom, 481 in all", () => {
    const p = pyramid(5375, 4000);
    expect(p).toMatchObject({ maxLevel: 13, levels: 14, tileSize: 254, tileOverlap: 1 });
    expect(tilesAt(p, 13)).toEqual({ cols: 22, rows: 16 });
    expect(levelSize(p, 12)).toEqual({ width: 2688, height: 2000 });
    expect(tilesAt(p, 12)).toEqual({ cols: 11, rows: 8 });
    expect(levelSize(p, 0)).toEqual({ width: 1, height: 1 });
    expect(tilesAt(p, 0)).toEqual({ cols: 1, rows: 1 });
    expect(allTiles(p)).toHaveLength(481);
  });

  it("the edges: one pixel is one level; 256 px is nine levels and two tiles across at the top", () => {
    expect(pyramid(1, 1)).toMatchObject({ maxLevel: 0, levels: 1 });
    expect(pyramid(256, 256)).toMatchObject({ maxLevel: 8, levels: 9 });
    expect(tilesAt(pyramid(256, 256), 8)).toEqual({ cols: 2, rows: 2 });
    expect(tilesAt(pyramid(254, 100), 8)).toEqual({ cols: 1, rows: 1 });
  });

  it("an address is two parts of plain digits, and nothing else", () => {
    expect(parseTile(["13", "3_2"])).toEqual({ level: 13, x: 3, y: 2 });
    expect(parseTile(["0", "0_0"])).toEqual({ level: 0, x: 0, y: 0 });
    for (const bad of [["13"], ["13", "3_2", "more"], ["-1", "0_0"], ["013", "0_0"], ["13", "3-2"], ["a", "0_0"], ["13", "3_2.jpg"], ["13", "03_2"], ["1e1", "0_0"], [], ["13", ""]]) {
      expect(parseTile(bad), bad.join("/")).toBeNull();
    }
  });

  it("a tile is in the pyramid or it is not", () => {
    const p = pyramid(5375, 4000);
    expect(hasTile(p, { level: 13, x: 21, y: 15 })).toBe(true);
    expect(hasTile(p, { level: 13, x: 22, y: 15 })).toBe(false);
    expect(hasTile(p, { level: 13, x: 21, y: 16 })).toBe(false);
    expect(hasTile(p, { level: 14, x: 0, y: 0 })).toBe(false);
    expect(hasTile(p, { level: 0, x: 0, y: 0 })).toBe(true);
    expect(hasTile(p, { level: 0, x: 1, y: 0 })).toBe(false);
    expect(hasTile(p, { level: -1, x: 0, y: 0 })).toBe(false);
    expect(tileKey("collections/c/items/i/tiles/s", { level: 13, x: 3, y: 2 })).toBe("collections/c/items/i/tiles/s/13/3_2.jpg");
  });
});

describe("what sharp cuts agrees with the rule", () => {
  it("a 600 × 400 picture: eleven levels on disk, exactly the tiles the rule names, 256 px across in the middle, no metadata", async () => {
    const source = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#446688" } })
      .withExif({ IFD0: { Make: "TestCam" } })
      .jpeg()
      .toBuffer();
    const dir = mkdtempSync(path.join(tmpdir(), "pyramid-"));
    try {
      const cut = await tiles(source, dir);
      expect(cut).toMatchObject({ width: 600, height: 400 });
      const p = pyramid(600, 400);
      expect(p).toMatchObject({ maxLevel: 10, levels: 11 });

      const levelDirs = readdirSync(cut.filesDir)
        .filter((n) => /^\d+$/.test(n))
        .map(Number)
        .sort((a, b) => a - b);
      expect(levelDirs).toEqual([...Array(p.levels).keys()]);

      const ext = existsSync(path.join(cut.filesDir, "0", "0_0.jpeg")) ? ".jpeg" : ".jpg";
      const file = (level: number, x: number, y: number) => path.join(cut.filesDir, String(level), `${x}_${y}${ext}`);
      for (const t of allTiles(p)) expect(existsSync(file(t.level, t.x, t.y)), `${t.level}/${t.x}_${t.y}`).toBe(true);
      const top = tilesAt(p, p.maxLevel);
      expect(top).toEqual({ cols: 3, rows: 2 });
      expect(readdirSync(path.join(cut.filesDir, String(p.maxLevel)))).toHaveLength(top.cols * top.rows);

      // 254 px plus one of overlap on each inner edge: the first tile 255, the middle 256, the last 600 − 508 + 1 = 93.
      const widths = await Promise.all([0, 1, 2].map(async (x) => (await sharp(file(p.maxLevel, x, 0)).metadata()).width));
      expect(widths).toEqual([255, 256, 93]);
      const m = await sharp(file(p.maxLevel, 1, 0)).metadata();
      expect(m.format).toBe("jpeg");
      expect(m.exif).toBeUndefined();
      expect(m.space).toBe("srgb");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
