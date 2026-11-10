/**
 * The shape the gallery works with. Deliberately narrow: only what a screen may show. Nothing of
 * value, price, location or ownership has a field here, so nothing of it can reach a page — or its
 * source — by accident. Rows from the database are read into this shape on the server
 * (`toWork`, in `read.ts`) and only this shape is handed to components.
 */

/** One rung of the ladder. The browser asks for `/i/<id>` and the image door decides. */
export type Rendition = {
  id: string;
  format: "avif" | "jpeg";
  width: number;
  height: number;
};

/** The pyramid cut from the picture's source, for the glass; the tile door decides each tile. */
export type TileSet = {
  id: string;
  width: number;
  height: number;
  tileSize: number;
  tileOverlap: number;
  levels: number;
};

/**
 * A work's picture: the size of its best source (a master, else the Airtable photograph), the
 * 24 px stand-in drawn before any file arrives, and the renditions cut from it. Never the
 * source's own id, and never a master's: only renditions are ever asked for.
 */
export type Picture = {
  width: number | null;
  height: number | null;
  /** A data URI (~600 bytes), in the HTML itself. */
  placeholder: string | null;
  renditions: Rendition[];
  /** Null for most works: only a source of 4,000 px or more has one, and only then is there a glass. */
  tileSet: TileSet | null;
};

export type Work = {
  id: string;
  artist: string | null;
  title: string | null;
  /** The parsed year, when the text yields one. */
  year: number | null;
  /** The year as entered ("Circa 1980's", "Undated"), shown when nothing parses. */
  yearText: string | null;
  medium: string | null;
  dimensions: string | null;
  edition: string | null;
  /** The invoice date, ISO `YYYY-MM-DD`; the order of the wall. */
  acquiredOn: string | null;
  /** Where it came from, as entered ("Stevenson", "Artist", "Strauss Auction"). */
  acquiredFrom: string | null;
  /** The sold line is the one status the gallery shows: the tail under the hairline. */
  sold: boolean;
  /** The work's picture; null when it has none yet (it hangs as its label). */
  picture: Picture | null;
};
