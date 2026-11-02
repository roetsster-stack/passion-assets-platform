import { hang } from "./order";
import { treatment } from "./treatment";
import type { Work } from "./types";

/**
 * The hero: the newest acquisition still held whose photograph is at least 1,600 px on its long
 * side. Nobody chooses it — a newer, better-photographed work takes the wall the day it is
 * ingested. Null when no held work qualifies; the wall then opens on the body of work.
 */
export function chooseHero(works: Work[]): Work | null {
  return hang(works).held.find((w) => treatment(w.picture) === "full") ?? null;
}
