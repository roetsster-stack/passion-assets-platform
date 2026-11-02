import type { Work } from "./types";

/**
 * The words under a work. The tombstone is the label: artist, title, year — and on the single-work
 * screen medium, dimensions and edition. Text is shown as entered; missing parts simply drop out.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function yearOf(w: Pick<Work, "year" | "yearText">): string | null {
  if (w.year !== null) return String(w.year);
  return w.yearText?.trim() || null;
}

/** One line: "Artist, Title, Year". Used on the wall (on intent) and under the hero. */
export function tombstoneLine(w: Work): string {
  return [w.artist, w.title, yearOf(w)].filter((p): p is string => !!p && p.trim() !== "").join(", ");
}

/** The longer tombstone of the single-work screen, one entry per line, empty parts dropped. */
export function tombstoneDetail(w: Work): string[] {
  return [w.medium, w.dimensions, w.edition].filter((p): p is string => !!p && p.trim() !== "").map((p) => p.trim());
}

/** "March 2016" from an ISO date; null when the date does not parse. */
export function monthYear(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

/**
 * How it came: "Acquired from Stevenson, March 2016". "Artist" as the source reads as "the artist".
 * With only one of the two, the line says what it knows; with neither, there is no line.
 */
export function acquisitionLine(w: Pick<Work, "acquiredFrom" | "acquiredOn">): string | null {
  const raw = w.acquiredFrom?.trim() || null;
  const from = raw && /^(the\s+)?artist$/i.test(raw) ? "the artist" : raw;
  const when = monthYear(w.acquiredOn);
  if (from && when) return `Acquired from ${from}, ${when}`;
  if (from) return `Acquired from ${from}`;
  if (when) return `Acquired ${when}`;
  return null;
}
