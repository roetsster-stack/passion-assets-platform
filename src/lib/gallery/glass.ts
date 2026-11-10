/**
 * The glass in the hand (M1-02c): the parts of the glass that are logic rather than CSS or a
 * browser's touch handling, kept apart from the component so they can be proved without a browser.
 *
 * - The way out (the word *close* and the work's one line) shows as the glass opens and at every
 *   touch, then fades after `DWELL_MS`. OpenSeadragon handles touches on its own canvas; the events
 *   in `HAND_ON_GLASS` are its names for a hand on the glass, each one a cue.
 * - The phone's Back closes the glass: opening takes one step in the history, marked as the glass's;
 *   Back takes it away and that closes the glass; closing any other way takes the step away itself,
 *   so a Back afterwards is the page's own, as if the glass had never been opened. A page reloaded
 *   while the glass was open arrives on the glass's step with the glass shut; the mark is forgotten.
 * - Turning the phone: a work being shown whole is fitted to the new shape again; a place being
 *   looked at is kept.
 */

export const DWELL_MS = 2200;

/** OpenSeadragon's events for a hand on the glass — each brings the way out back. */
export const HAND_ON_GLASS = ["canvas-press", "canvas-drag", "canvas-pinch", "canvas-release"] as const;

/** The least a history must offer for the glass to take one step of its own. */
export type Steps = {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
};

/** The glass's step carries this mark; whatever else the page's router adds to the entry stays. */
export const isGlassStep = (state: unknown, id: string): boolean =>
  typeof state === "object" && state !== null && (state as { glass?: unknown }).glass === id;

/** Opening: one step on top of the page's own, at the same address. */
export function takeStep(history: Steps, id: string): void {
  history.pushState({ glass: id }, "");
}

/** The history moved (Back, or Forward): the glass closes unless the page is still on the glass's step. */
export const popClosesGlass = (state: unknown, id: string): boolean => !isGlassStep(state, id);

/**
 * Closing by the word or by Escape: the step is taken away if the page is still on it — and only
 * then, so a glass that Back has already closed never sends the page back a second time.
 */
export function leaveStep(history: Steps, id: string): void {
  if (isGlassStep(history.state, id)) history.back();
}

/**
 * The page arrived on the glass's own step with the glass shut — a reload while it was open. The
 * mark is taken off the entry, so the next Back is the page's own and not a step swallowed.
 */
export function forgetStep(history: Steps, id: string): void {
  if (isGlassStep(history.state, id)) history.replaceState({}, "");
}

/**
 * After a turn of the phone OpenSeadragon keeps the place and the scale. At or under the home zoom
 * the whole work was on the screen, so it is fitted to the new shape again; above it the collector
 * was looking at a place, and that is kept.
 */
export const afterTurn = (zoom: number, homeZoom: number): "fit" | "keep" => (zoom <= homeZoom * 1.001 ? "fit" : "keep");
