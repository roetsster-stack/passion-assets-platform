/**
 * The shape the gallery works with. Deliberately narrow: only what a screen may show. Nothing of
 * value, price, location or ownership has a field here, so nothing of it can reach a page — or its
 * source — by accident. Rows from the database are read into this shape on the server
 * (`toWork`, in `read.ts`) and only this shape is handed to components.
 */

export type Picture = {
  /** The image row's id; the browser asks for `/i/<id>` and the image door decides. */
  id: string;
  width: number | null;
  height: number | null;
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
  /** The work's first photograph; null when there is none. */
  picture: Picture | null;
};
