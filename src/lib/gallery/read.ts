import { SERVABLE_KINDS } from "@/lib/images/door";
import type { Picture, Work } from "./types";

/**
 * From database rows to the gallery's shape. The select below names every column the gallery
 * reads; value, price, location, ownership, notes and the raw Airtable record are not among them,
 * and `toWork` copies only the fields of `Work` — so even a wider row could not leak through.
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
  "images(id, kind, width, height, is_hero, sort_order)",
].join(", ");

export type ImageRow = { id: string; kind: string; width: number | null; height: number | null; is_hero: boolean; sort_order: number };

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
  images: ImageRow[] | null;
};

/** The work's first photograph that may be served: the hero image, then by its order. */
export function firstPicture(images: ImageRow[] | null): Picture | null {
  const servable = (images ?? []).filter((i) => (SERVABLE_KINDS as readonly string[]).includes(i.kind));
  servable.sort((a, b) => Number(b.is_hero) - Number(a.is_hero) || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const p = servable[0];
  return p ? { id: p.id, width: p.width, height: p.height } : null;
}

export function toWork(r: WorkRow): Work {
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
    picture: firstPicture(r.images),
  };
}
