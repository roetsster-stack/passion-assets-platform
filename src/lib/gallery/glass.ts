/**
 * The glass in the hand (M1-02c): the parts of the glass that are logic rather than CSS or a
 * browser's touch handling, kept apart from the component so they can be proved without a browser.
 *
 * - The way out (the word *close* and the work's one line) shows as the glass opens and at every
 *   touch, then fades after `DWELL_MS`. A hand may take it only once it has fully appeared, so the
 *   glass can never be closed by a word that could not be seen: the first touch brings the word back.
 * - The phone's Back closes the glass: opening takes one step in the history, marked as the glass's;
 *   Back takes it away and that closes the glass; closing any other way takes the step away itself,
 *   so a Back afterwards is the page's own. The step is taken and left in the hand's own actions —
 *   opening and closing — never in an effect, which React runs twice in development.
 * - A page that arrives on the glass's step with the glass shut (a reload while it was open; Forward
 *   onto the step the word left behind) forgets the mark and keeps whatever else the entry holds.
 * - Turning the phone: a work being shown whole is fitted to the new shape again; a place being
 *   looked at is kept.
 *
 * Every write to the history carries the entry's other keys along itself. Next's router keeps its own
 * marks on each entry (`__NA`, its tree) and re-adds them when it has patched `pushState` and
 * `replaceState` — but a child's mount effect runs before the router's, so nothing here relies on it.
 */

export const DWELL_MS = 2200;
/** How long the word takes to appear — the opacity transition on it (`duration-500`). */
export const FADE_MS = 500;

/** OpenSeadragon's events for a hand on the glass — each one a cue for the way out. */
export const HAND_ON_GLASS = ["canvas-press", "canvas-drag", "canvas-pinch", "canvas-release"] as const;

/** The way out: shown until `shownUntil`; a hand may take it from `liveFrom`, when it has fully appeared. */
export type WayOut = { shownUntil: number; liveFrom: number };

/** A cue at time `now` — the glass opening, or a hand on it. A word already showing keeps its time. */
export function cue(now: number, before: WayOut | null): WayOut {
  const showing = before !== null && now < before.shownUntil;
  return { shownUntil: now + DWELL_MS, liveFrom: showing ? before.liveFrom : now + FADE_MS };
}
export const isShown = (w: WayOut | null, now: number): boolean => w !== null && now < w.shownUntil;
export const isLive = (w: WayOut | null, now: number): boolean => w !== null && now < w.shownUntil && now >= w.liveFrom;

/** The least a history must offer for the glass to take one step of its own. */
export type Steps = {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
};

/** The glass's step carries this mark; whatever else the page's router keeps on the entry stays. */
export const isGlassStep = (state: unknown, id: string): boolean =>
  typeof state === "object" && state !== null && (state as { glass?: unknown }).glass === id;

/** The entry's other keys — the router's own marks — to carry along on every write. */
function carried(state: unknown): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  if (typeof state === "object" && state !== null) {
    for (const [key, value] of Object.entries(state as Record<string, unknown>)) if (key !== "glass") rest[key] = value;
  }
  return rest;
}

/** Opening: one step on top of the page's own, at the same address, carrying the router's marks. */
export function takeStep(history: Steps, id: string): void {
  history.pushState({ ...carried(history.state), glass: id }, "");
}

/** The history moved while the glass is open: it closes unless the page is still on the glass's step. */
export const popClosesGlass = (state: unknown, id: string): boolean => !isGlassStep(state, id);

/**
 * Closing by the word or by Escape: the step is taken away if the page is still on it — and only
 * then, so a glass that Back has already closed never sends the page back a second time.
 */
export function leaveStep(history: Steps, id: string): void {
  if (isGlassStep(history.state, id)) history.back();
}

/**
 * The page is on the glass's step with the glass shut — a reload while it was open, or Forward onto
 * the step the word left behind. The mark is taken off the entry and everything else on it kept,
 * so the next Back from here is the page's own and a glass opened from here closes on one Back.
 */
export function forgetStep(history: Steps, id: string): void {
  if (isGlassStep(history.state, id)) history.replaceState(carried(history.state), "");
}

/**
 * After a turn of the phone OpenSeadragon keeps the place and the scale. At or under the home zoom
 * the whole work was on the screen, so it is fitted to the new shape again; above it the collector
 * was looking at a place, and that is kept.
 */
export const afterTurn = (zoom: number, homeZoom: number): "fit" | "keep" => (zoom <= homeZoom * 1.001 ? "fit" : "keep");
