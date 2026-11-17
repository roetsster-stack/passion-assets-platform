/**
 * M2-04 · The minimal input — the whole of what the desk may know about an artist and their works
 * here: name, dates, nationality; each work's title, year and medium. These two column lists are
 * the only columns the command selects, so nothing else can reach a prompt: never a value, a price,
 * a location, an owner, a note (rule 5).
 */
import type { ArtistInput, WorkInput } from "./types";

export const ARTIST_COLUMNS = ["id", "display_name", "surname", "given_name", "nationality", "birth_year", "death_year"] as const;
export const WORK_COLUMNS = ["artist_id", "title", "year_text", "year", "medium"] as const;

export type ArtistRow = { id: string; display_name: string; surname: string; given_name: string | null; nationality: string[] | null; birth_year: number | null; death_year: number | null };
export type WorkRow = { artist_id: string; title: string | null; year_text: string | null; year: number | null; medium: string | null };

export function toWorkInput(w: Pick<WorkRow, "title" | "year_text" | "year" | "medium">): WorkInput {
  return { title: w.title, year: w.year_text ?? (w.year === null ? null : String(w.year)), medium: w.medium };
}

/** Builds the input from rows by name — any other field on the rows is left behind. */
export function toArtistInput(a: ArtistRow, works: Pick<WorkRow, "title" | "year_text" | "year" | "medium">[]): ArtistInput {
  return {
    id: a.id,
    displayName: a.display_name,
    surname: a.surname,
    givenName: a.given_name,
    nationality: a.nationality ?? [],
    birthYear: a.birth_year,
    deathYear: a.death_year,
    works: works.map(toWorkInput),
  };
}

/** The artist, as the prompt says them. */
export function describeArtist(a: ArtistInput): string {
  const dates = a.birthYear && a.deathYear ? ` (${a.birthYear}–${a.deathYear})` : a.birthYear ? ` (b. ${a.birthYear})` : a.deathYear ? ` (d. ${a.deathYear})` : "";
  const nationality = a.nationality.length ? `; ${a.nationality.join(", ")}` : "";
  const works = a.works.length
    ? a.works.map((w) => `  - ${w.title ? `*${w.title}*` : "Untitled"}${w.year ? `, ${w.year}` : ""}${w.medium ? ` — ${w.medium}` : ""}`).join("\n")
    : "  (none recorded)";
  return `Artist: ${a.displayName}${dates}${nationality}\nWorks in this collection (title, year, medium):\n${works}`;
}

export const isLiving = (a: ArtistInput) => a.deathYear === null;
