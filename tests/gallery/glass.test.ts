/**
 * M1-02c · the glass in the hand: the step the glass takes in the phone's history, when the way out
 * shows and when a hand may take it, that the viewer's cues are real, and what a turn of the phone
 * does. What is CSS or a browser's own touch handling (pinch-zoom of the page, the thumb target,
 * the safe areas, the development double mount) is checked in a browser and judged on a phone.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  afterTurn,
  cue,
  DWELL_MS,
  FADE_MS,
  forgetStep,
  HAND_ON_GLASS,
  isGlassStep,
  isLive,
  isShown,
  leaveStep,
  popClosesGlass,
  type Steps,
  takeStep,
} from "@/lib/gallery/glass";

/**
 * A browser history in miniature: entries and a cursor. It stores exactly what it is given — so
 * what survives a write survives because the code carried it, not because the miniature put it back.
 * `patched` imitates Next's router instead, which re-adds its marks to every entry written.
 */
function history(patched = false) {
  const marks = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] };
  // The wall beneath the single work: a Back too many is visible as a landing on the wall.
  const entries: unknown[] = [{ page: "the wall", ...marks }, { page: "the single work", ...marks }];
  let at = 1;
  const popped: unknown[] = [];
  const write = (data: unknown) => (patched ? { ...(data as object), ...marks } : data);
  const h: Steps & { entries: unknown[]; at(): number; popped: unknown[]; forward(): void } = {
    get state() {
      return entries[at];
    },
    pushState(data) {
      entries.splice(at + 1);
      entries.push(write(data));
      at++;
    },
    replaceState(data) {
      entries[at] = write(data);
    },
    back() {
      if (at === 0) return;
      at--;
      popped.push(entries[at]);
    },
    forward() {
      if (at === entries.length - 1) return;
      at++;
      popped.push(entries[at]);
    },
    entries,
    at: () => at,
    popped,
  };
  return h;
}
const id = "00000000-0000-4000-8000-000000000001";
const marked = (state: unknown) => (state as { __NA?: boolean; __PRIVATE_NEXTJS_INTERNALS_TREE?: unknown }).__NA === true && Array.isArray((state as { __PRIVATE_NEXTJS_INTERNALS_TREE?: unknown }).__PRIVATE_NEXTJS_INTERNALS_TREE);

describe("the step the glass takes", () => {
  it("opening adds one step above the page's own, marked as the glass's, carrying the router's marks itself", () => {
    const h = history();
    takeStep(h, id);
    expect(h.entries).toHaveLength(3);
    expect(h.at()).toBe(2);
    expect(isGlassStep(h.state, id)).toBe(true);
    expect(marked(h.state)).toBe(true); // copied by takeStep, with no router patch in the way
    expect(isGlassStep(h.entries[1], id)).toBe(false);
    expect(h.entries[1]).toMatchObject({ page: "the single work" });
  });

  it("under Next's own patch the entry comes out the same", () => {
    const plain = history();
    const patched = history(true);
    takeStep(plain, id);
    takeStep(patched, id);
    expect(patched.state).toEqual(plain.state);
  });

  it("the phone's Back lands on the page's own step, and that closes the glass", () => {
    const h = history();
    takeStep(h, id);
    h.back();
    expect(popClosesGlass(h.state, id)).toBe(true);
    expect(h.state).toMatchObject({ page: "the single work" });
  });

  it("closing by the word or Escape takes the step away, so a Back afterwards is the page's own", () => {
    const h = history();
    takeStep(h, id);
    leaveStep(h, id);
    expect(h.at()).toBe(1);
    expect(h.state).toMatchObject({ page: "the single work" });
    expect(h.popped).toHaveLength(1);
    h.back(); // the Back afterwards
    expect(h.state).toMatchObject({ page: "the wall" });
  });

  it("a glass that Back has already closed never sends the page back a second time — the wall stays beneath", () => {
    const h = history();
    takeStep(h, id);
    h.back(); // the collector pressed Back; the glass closed on the pop
    leaveStep(h, id); // and then unmounted
    expect(h.at()).toBe(1);
    expect(h.state).toMatchObject({ page: "the single work" });
    expect(h.popped).toHaveLength(1);
  });

  it("the word twice, or the word and Escape together, is still one step back", () => {
    const h = history();
    takeStep(h, id);
    leaveStep(h, id);
    leaveStep(h, id);
    expect(h.at()).toBe(1);
    expect(h.state).toMatchObject({ page: "the single work" });
  });

  it("opened again after the word closed it, there is one step above the page and none left behind", () => {
    const h = history();
    takeStep(h, id);
    leaveStep(h, id);
    takeStep(h, id);
    expect(h.entries).toHaveLength(3);
    expect(h.at()).toBe(2);
    expect(h.entries.filter((s) => isGlassStep(s, id))).toHaveLength(1);
  });

  it("a page reloaded while the glass was open forgets the step it arrived on and keeps the router's marks — with no patch in place", () => {
    const h = history();
    takeStep(h, id); // open…
    // …reload: the browser keeps the entry and its state; the page starts again with the glass shut,
    // and its mount effect runs before Next has patched the history.
    forgetStep(h, id);
    expect(isGlassStep(h.state, id)).toBe(false);
    expect(marked(h.state)).toBe(true);
    expect(h.at()).toBe(2); // the entry itself stays; only the mark goes
    // A page that did not arrive on the glass's step is left exactly as it is.
    const plain = history();
    const before = plain.state;
    forgetStep(plain, id);
    expect(plain.state).toBe(before);
  });

  it("Forward onto the step the word left behind: the mark is forgotten, so a glass opened there closes on one Back", () => {
    const h = history();
    takeStep(h, id);
    leaveStep(h, id); // the word: Back, the step left behind as a Forward entry
    h.forward(); // Safari's arrow, a swipe from the right edge
    expect(isGlassStep(h.state, id)).toBe(true); // what the pop lands on, glass shut
    forgetStep(h, id); // the pop listener, glass shut
    expect(isGlassStep(h.state, id)).toBe(false);
    expect(marked(h.state)).toBe(true);
    takeStep(h, id); // opened from here
    h.back(); // the first Back…
    expect(popClosesGlass(h.state, id)).toBe(true); // …closes it
  });

  it("only the glass's own mark counts: another id, a bare page, nothing at all", () => {
    expect(isGlassStep({ glass: "00000000-0000-4000-8000-000000000002" }, id)).toBe(false);
    expect(isGlassStep({ glass: true }, id)).toBe(false);
    expect(isGlassStep(null, id)).toBe(false);
    expect(isGlassStep(undefined, id)).toBe(false);
    expect(isGlassStep("glass", id)).toBe(false);
    expect(popClosesGlass(null, id)).toBe(true);
  });
});

describe("when the way out shows, and when a hand may take it", () => {
  it("shown from the moment the glass opens, for 2.2 s, then gone", () => {
    const w = cue(0, null);
    expect(isShown(w, 0)).toBe(true);
    expect(isShown(w, DWELL_MS - 1)).toBe(true);
    expect(isShown(w, DWELL_MS)).toBe(false);
    expect(isShown(null, 0)).toBe(false);
  });

  it("a touch while it shows keeps it for 2.2 s more; a touch after it has gone brings it back", () => {
    const opened = cue(0, null);
    const touched = cue(1500, opened);
    expect(isShown(touched, 3699)).toBe(true);
    expect(isShown(touched, 3700)).toBe(false);
    const back = cue(5000, touched);
    expect(isShown(back, 5000)).toBe(true);
  });

  it("a hand may take it only once it has fully appeared — half a second after it came — and not while it is away", () => {
    const w = cue(0, null);
    expect(FADE_MS).toBe(500);
    expect(isLive(w, 499)).toBe(false);
    expect(isLive(w, 500)).toBe(true);
    expect(isLive(w, DWELL_MS - 1)).toBe(true);
    expect(isLive(w, DWELL_MS)).toBe(false);
    expect(isLive(null, 0)).toBe(false);
  });

  it("a word already showing stays live through the touches that keep it; a word brought back must appear again first", () => {
    const opened = cue(0, null);
    const kept = cue(1000, opened); // a drag, say
    expect(kept.liveFrom).toBe(500);
    expect(isLive(kept, 1000)).toBe(true);
    const gone = DWELL_MS + 1000 + 1;
    expect(isShown(kept, gone)).toBe(false);
    const back = cue(gone, kept); // the first touch after it faded
    expect(isLive(back, gone)).toBe(false); // …only brings it back
    expect(isLive(back, gone + FADE_MS)).toBe(true);
  });

  it("a double tap in the corner while the word is away zooms the glass; it never meets the word", () => {
    const first = cue(0, null);
    const second = cue(250, first); // a double tap's second touch
    expect(isLive(first, 250)).toBe(false);
    expect(isLive(second, 250)).toBe(false);
  });
});

describe("the viewer's cues", () => {
  it("are events OpenSeadragon 5.0.1 raises from its canvas, by those names", () => {
    const osd = readFileSync(createRequire(import.meta.url).resolve("openseadragon"), "utf8");
    expect(/@version openseadragon 5\.0\.1\b/.test(osd)).toBe(true);
    for (const name of HAND_ON_GLASS) expect(osd.includes(`raiseEvent( '${name}'`) || osd.includes(`raiseEvent('${name}'`), name).toBe(true);
    expect(HAND_ON_GLASS).toContain("canvas-press");
    expect(HAND_ON_GLASS).toContain("canvas-pinch");
  });
});

describe("turning the phone", () => {
  it("a work shown whole — at the home zoom, or under it — is fitted to the new shape again", () => {
    expect(afterTurn(1, 1)).toBe("fit");
    expect(afterTurn(0.9, 1)).toBe("fit");
    expect(afterTurn(0.621, 0.621)).toBe("fit");
    expect(afterTurn(0.62100001, 0.621)).toBe("fit");
  });

  it("a place being looked at is kept", () => {
    expect(afterTurn(1.01, 1)).toBe("keep");
    expect(afterTurn(4.333, 1)).toBe("keep");
    expect(afterTurn(2.164, 0.621)).toBe("keep");
  });
});
