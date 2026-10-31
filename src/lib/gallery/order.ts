import type { Work } from "./types";

/**
 * The order of the wall: acquisition, newest first. Dated works by invoice date; then the undated,
 * by year (newest first), then title; then the sold works under their hairline, in the same order.
 * Ties fall back to title and then id, so the order never changes between two loads.
 */

const byTitle = (a: Work, b: Work) => (a.title ?? "").localeCompare(b.title ?? "", "en", { sensitivity: "base" });

function compareHeld(a: Work, b: Work): number {
  if (a.acquiredOn && b.acquiredOn) {
    if (a.acquiredOn !== b.acquiredOn) return a.acquiredOn < b.acquiredOn ? 1 : -1;
  } else if (a.acquiredOn || b.acquiredOn) {
    return a.acquiredOn ? -1 : 1;
  } else if (a.year !== b.year) {
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    return b.year - a.year;
  }
  return byTitle(a, b) || a.id.localeCompare(b.id);
}

export type Hanging = { held: Work[]; sold: Work[] };

export function hang(works: Work[]): Hanging {
  const held = works.filter((w) => !w.sold).sort(compareHeld);
  const sold = works.filter((w) => w.sold).sort(compareHeld);
  return { held, sold };
}

/** The whole walk, as the arrows on the single-work screen follow it: the held, then the sold. */
export function walk(works: Work[]): Work[] {
  const { held, sold } = hang(works);
  return [...held, ...sold];
}

/** The neighbours of a work in the walk; null at either end. */
export function neighbours(works: Work[], id: string): { previous: Work | null; next: Work | null } {
  const all = walk(works);
  const i = all.findIndex((w) => w.id === id);
  if (i < 0) return { previous: null, next: null };
  return { previous: all[i - 1] ?? null, next: all[i + 1] ?? null };
}
