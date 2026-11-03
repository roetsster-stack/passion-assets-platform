import type { CSSProperties } from "react";
import { SAVE_DATA_CAP } from "@/lib/images/ladder";
import type { Treatment } from "./treatment";
import type { Picture, Rendition } from "./types";

/**
 * How a picture is asked for — pure. The page offers the browser every rung (AVIF first, JPEG
 * beside it) with each rung's true width, and says how wide the picture will hang (`sizes`); the
 * browser takes the smallest file that is sharp on its screen. A phone never fetches a laptop's
 * file. When the browser says it is saving data, nothing above 1,080 is offered at all.
 */

export const imageAddress = (r: Pick<Rendition, "id">) => `/i/${r.id}`;

const longSideOf = (r: Rendition) => Math.max(r.width, r.height);

export function rungsFor(picture: Picture, format: Rendition["format"], saveData: boolean): Rendition[] {
  return picture.renditions
    .filter((r) => r.format === format && (!saveData || longSideOf(r) <= SAVE_DATA_CAP))
    .sort((a, b) => a.width - b.width);
}

export function srcSet(rungs: Rendition[]): string {
  return rungs.map((r) => `${imageAddress(r)} ${r.width}w`).join(", ");
}

/** The `src` for a browser that reads no `srcset`: the largest JPEG up to 1,080, else the smallest. */
export function fallback(picture: Picture): Rendition | null {
  const jpegs = rungsFor(picture, "jpeg", false);
  return [...jpegs].reverse().find((r) => longSideOf(r) <= SAVE_DATA_CAP) ?? jpegs[0] ?? null;
}

export type Place = "cell" | "stage";

/**
 * How wide the picture hangs, in the wall's own terms. A cell: one column on a phone, two on a
 * tablet, three on a laptop, inside the wall's margins. A stage: the screen's width, unless the
 * picture is taller than the screen is wide in proportion — then its height sets its width. A
 * contained photograph on a stage hangs at most seven-tenths of the screen.
 */
export function sizesFor(place: Place, t: Treatment, picture: Picture): string {
  if (place === "cell") return "(min-width: 1024px) 27vw, (min-width: 640px) 42vw, 88vw";
  const w = picture.width ?? 1;
  const h = picture.height ?? 1;
  const share = t === "contained" ? 70 : 100;
  return `min(${share}vw, ${Math.max(1, Math.round((share * w) / h))}vh)`;
}

/**
 * The stand-in, drawn as the picture's own background until the file covers it. On a matted
 * picture it fills only the picture, never the mat around it.
 */
export function standInStyle(placeholder: string | null, matted: boolean): CSSProperties {
  if (!placeholder) return {};
  const url = `url("${placeholder}")`;
  if (!matted) return { backgroundImage: url, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" };
  return {
    backgroundImage: `${url}, linear-gradient(var(--color-gallery-raised), var(--color-gallery-raised))`,
    backgroundClip: "content-box, border-box",
    backgroundOrigin: "content-box, border-box",
    backgroundSize: "100% 100%, auto",
    backgroundRepeat: "no-repeat",
  };
}

/** The browser's `Save-Data` request header: "on" when the person has asked to save data. */
export function isSaveData(header: string | null | undefined): boolean {
  return header?.trim().toLowerCase() === "on";
}
