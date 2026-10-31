/**
 * The three looks of the first preview — the same data, three hangings — switched with `?look=`
 * and remembered for the visit in a session cookie. Removed in the follow-up PR once one is chosen.
 *
 *   1 Monograph (default) · 2 Salon · 3 Flow
 */

export type Look = 1 | 2 | 3;

export const LOOK_COOKIE = "look";
export const DEFAULT_LOOK: Look = 1;

export function parseLook(value: string | string[] | null | undefined): Look | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "2" || v === "3" ? (Number(v) as Look) : null;
}

/** The address wins over the remembered look; anything unrecognised falls back to the default. */
export function chooseLook(fromQuery: string | string[] | null | undefined, fromCookie: string | null | undefined): Look {
  return parseLook(fromQuery) ?? parseLook(fromCookie) ?? DEFAULT_LOOK;
}
