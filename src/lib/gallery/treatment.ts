import type { Picture } from "./types";

/**
 * How a photograph hangs, by its long side (Q7 a). A poor photograph is never hidden and never
 * stretched: it hangs smaller, matted, no larger than it truly is.
 *
 *   ≥ 1,600 px     full — may hang full-bleed; hero-eligible
 *   1,000–1,599 px contained — up to about 70 % of the viewport
 *   < 1,000 px     matted — on gallery-raised, never past its own pixels
 *   none           label — the tombstone card, in its place
 */

export const FULL_BLEED_MIN = 1600;
export const CONTAINED_MIN = 1000;

export type Treatment = "full" | "contained" | "matted" | "label";

export function longSide(p: Picture | null): number | null {
  if (!p || !p.width || !p.height) return null;
  return Math.max(p.width, p.height);
}

export function treatment(p: Picture | null): Treatment {
  if (!p) return "label";
  const side = longSide(p);
  // A picture whose size was never recorded is treated as the smallest: never risk stretching it.
  if (side === null) return "matted";
  if (side >= FULL_BLEED_MIN) return "full";
  if (side >= CONTAINED_MIN) return "contained";
  return "matted";
}
