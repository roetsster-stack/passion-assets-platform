/**
 * Which of a work's files is its picture — pure. Every rendition the wall shows is cut from the best
 * source the work has: an archival master if there is one, else the Airtable photograph.
 *
 * A master hangs only once its ladder is cut: until then (and if its file will not cut) the
 * Airtable photograph stays the picture, so a work never hangs as a label for want of renditions.
 *
 * Among masters, the first flat capture: files whose names say they are a detail, a raking light,
 * an installation view or the back come after the plain ones (choosing among views on screen is
 * M3) — words of the work's own title do not count, so a title with "back" or "side" in it is not
 * a view. Then the shortest name, so "Work.tif" precedes "Work (2).tif"; then by name. Among
 * Airtable photographs, the first attachment.
 */

export type SourceKind = "master" | "lowres_airtable";

export type Source = {
  id: string;
  kind: SourceKind;
  sort_order: number;
  original_filename: string | null;
  /** Whether the ladder has been cut from this source. A master is eligible only when true; undefined (fixtures) counts as cut. */
  cut?: boolean;
};

const VIEW_TOKENS = new Set(["detail", "details", "raking", "situ", "insitu", "installation", "install", "verso", "reverse", "back", "side", "angle", "crop"]);

function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Does the filename say this is a detail, a raking light, the back…? The work's title words are set aside first. */
export function isAlternateView(filename: string | null, title?: string | null): boolean {
  if (!filename) return false;
  const own = new Set(tokens(title));
  return tokens(filename).some((t) => !own.has(t) && VIEW_TOKENS.has(t));
}

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function bestSource<T extends Source>(sources: T[], work: { title?: string | null } = {}): T | null {
  const masters = sources.filter((s) => s.kind === "master" && s.cut !== false);
  if (masters.length) {
    return [...masters].sort(
      (a, b) =>
        Number(isAlternateView(a.original_filename, work.title)) - Number(isAlternateView(b.original_filename, work.title)) ||
        a.sort_order - b.sort_order ||
        tokens(a.original_filename).length - tokens(b.original_filename).length ||
        byName.compare(a.original_filename ?? "", b.original_filename ?? "") ||
        a.id.localeCompare(b.id),
    )[0];
  }
  const snapshots = sources.filter((s) => s.kind === "lowres_airtable");
  return [...snapshots].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))[0] ?? null;
}
