/**
 * Cutting the ladder and the tiles, with sharp (the library Next.js itself uses). Runs on Workshop
 * only — the ingest and the masters command — never in the app.
 *
 * Every output is sRGB, oriented by its EXIF, and carries no metadata at all: no EXIF, no GPS, no
 * camera, no embedded profile (the pixels are converted to sRGB, which is what a browser assumes).
 * JPEG quality 82, progressive; AVIF quality 50, effort 4. Tiles: Deep Zoom, 254 px, 1 px overlap,
 * JPEG 85. Transparency is flattened onto white.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  AVIF_EFFORT,
  AVIF_QUALITY,
  JPEG_QUALITY,
  ladderFor,
  STAND_IN_JPEG_QUALITY,
  STAND_IN_LONG_SIDE,
  type Format,
} from "./ladder";
import { TILE_JPEG_QUALITY, TILE_OVERLAP, TILE_SIZE } from "./pyramid";

export type Rendition = { longSide: number; format: Format; body: Buffer; width: number; height: number };

export type Cut = {
  /** The source's own size, as displayed (after EXIF orientation). */
  width: number;
  height: number;
  /** The 24 px stand-in, as a data URI. */
  placeholder: string;
  renditions: Rendition[];
};

export type TilesCut = {
  width: number;
  height: number;
  /** The folder holding `<level>/<x>_<y>.jpeg`, one folder per level, as Deep Zoom lays them out. */
  filesDir: string;
};

/** The part of the ladder the commands need — a seam so the database tests can run without encoding. */
export type Renderer = {
  /** The source's displayed size, without decoding the whole file where the format allows. */
  probe(input: Buffer): Promise<{ width: number; height: number }>;
  cut(input: Buffer): Promise<Cut>;
  /** The tile pyramid, written under `outDir`; the caller uploads it and removes the folder. */
  tiles(input: Buffer, outDir: string): Promise<TilesCut>;
};

// Masters may be very large (a 5,000 px TIFF at 16 bits); sharp's default pixel limit is for the web.
const open = (input: Buffer) => sharp(input, { limitInputPixels: false, failOn: "none" }).rotate();

function base(input: Buffer, longSide: number) {
  return open(input)
    .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb");
}

async function encode(input: Buffer, longSide: number, format: Format): Promise<Rendition> {
  const pipeline = base(input, longSide);
  const out =
    format === "jpeg"
      ? pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: false })
      : pipeline.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT });
  const { data, info } = await out.toBuffer({ resolveWithObject: true });
  return { longSide, format, body: data, width: info.width, height: info.height };
}

export async function probe(input: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(input, { limitInputPixels: false, failOn: "none" }).metadata();
  if (!m.width || !m.height) throw new Error("not a picture sharp can read");
  // EXIF orientations 5–8 turn the picture a quarter: its displayed width is its stored height.
  const quarter = (m.orientation ?? 1) >= 5;
  return quarter ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
}

export async function standIn(input: Buffer): Promise<string> {
  const data = await base(input, STAND_IN_LONG_SIDE).jpeg({ quality: STAND_IN_JPEG_QUALITY }).toBuffer();
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

export async function cut(input: Buffer): Promise<Cut> {
  const { width, height } = await probe(input);
  const renditions: Rendition[] = [];
  for (const longSide of ladderFor(Math.max(width, height))) {
    // JPEG first: it is quick, and if the source is unreadable the run learns it before the slow AVIF.
    renditions.push(await encode(input, longSide, "jpeg"));
    renditions.push(await encode(input, longSide, "avif"));
  }
  return { width, height, placeholder: await standIn(input), renditions };
}

/** The Deep Zoom pyramid: `set.dzi` and `set_files/<level>/<x>_<y>.jpeg` under `outDir`. */
export async function tiles(input: Buffer, outDir: string): Promise<TilesCut> {
  const { width, height } = await probe(input);
  mkdirSync(outDir, { recursive: true });
  await open(input)
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: TILE_JPEG_QUALITY })
    .tile({ size: TILE_SIZE, overlap: TILE_OVERLAP, layout: "dz", depth: "onepixel" })
    .toFile(path.join(outDir, "set.dz"));
  return { width, height, filesDir: path.join(outDir, "set_files") };
}

export const sharpRenderer: Renderer = { probe, cut, tiles };
