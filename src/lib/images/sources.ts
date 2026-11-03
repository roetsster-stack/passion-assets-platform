/**
 * Which of a work's files is its picture — pure. Every rendition the wall shows is cut from the best
 * source the work has: an archival master if there is one, else the Airtable photograph.
 *
 * Among masters, the first flat capture: files whose names say they are a detail, a raking light,
 * an installation view or the back come after the plain ones (choosing among views on screen is
 * M3); then by name, so "Work.tif" precedes "Work (detail 1).tif". Among Airtable photographs, the
 * first attachment.
 */

export type SourceKind = "master" | "lowres_airtable";

export type Source = { id: string; kind: SourceKind; sort_order: number; original_filename: string | null };

const VIEW_WORDS = /\b(detail|details|raking|in[\s_-]?situ|installation|install|verso|reverse|back|side|angle|crop)\b/i;

export function isAlternateView(filename: string | null): boolean {
  return !!filename && VIEW_WORDS.test(filename.replace(/[_]+/g, " "));
}

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function bestSource<T extends Source>(sources: T[]): T | null {
  const masters = sources.filter((s) => s.kind === "master");
  if (masters.length) {
    return [...masters].sort(
      (a, b) =>
        Number(isAlternateView(a.original_filename)) - Number(isAlternateView(b.original_filename)) ||
        a.sort_order - b.sort_order ||
        byName.compare(a.original_filename ?? "", b.original_filename ?? "") ||
        a.id.localeCompare(b.id),
    )[0];
  }
  const snapshots = sources.filter((s) => s.kind === "lowres_airtable");
  return [...snapshots].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))[0] ?? null;
}
