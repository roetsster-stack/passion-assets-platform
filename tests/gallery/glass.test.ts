/**
 * M1-02c · the glass in the hand: the step the glass takes in the phone's history, what a touch on
 * the glass counts as, and what a turn of the phone does. What is CSS or a browser's own touch
 * handling (pinch-zoom of the page, the thumb target, the safe areas) is judged on a phone.
 */
import { describe, expect, it } from "vitest";
import { afterTurn, DWELL_MS, forgetStep, HAND_ON_GLASS, isGlassStep, leaveStep, popClosesGlass, type Steps, takeStep } from "@/lib/gallery/glass";

/** A browser history in miniature: entries, a cursor, and a router like Next's that decorates every entry. */
function history(decorate: (s: Record<string, unknown>) => Record<string, unknown> = (s) => s) {
  const entries: unknown[] = [decorate({ page: "the single work" })];
  let at = 0;
  const popped: unknown[] = [];
  const h: Steps & { entries: unknown[]; at(): number; popped: unknown[] } = {
    get state() {
      return entries[at];
    },
    pushState(data) {
      entries.splice(at + 1);
      entries.push(decorate(data as Record<string, unknown>));
      at++;
    },
    replaceState(data) {
      entries[at] = decorate(data as Record<string, unknown>);
    },
    back() {
      if (at === 0) return;
      at--;
      popped.push(entries[at]);
    },
    entries,
    at: () => at,
    popped,
  };
  return h;
}
const nextLike = (s: Record<string, unknown>) => ({ ...s, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] });
const id = "00000000-0000-4000-8000-000000000001";

describe("the step the glass takes", () => {
  it("opening adds one step, marked as the glass's, above the page's own — and keeps what the router adds to it", () => {
    const h = history(nextLike);
    takeStep(h, id);
    expect(h.entries).toHaveLength(2);
    expect(h.at()).toBe(1);
    expect(isGlassStep(h.state, id)).toBe(true);
    expect((h.state as { __NA?: boolean }).__NA).toBe(true); // Next's mark survives, so Forward onto it never reloads
    expect(isGlassStep(h.entries[0], id)).toBe(false);
  });

  it("the phone's Back lands on the page's own step, and that closes the glass", () => {
    const h = history(nextLike);
    takeStep(h, id);
    h.back();
    expect(popClosesGlass(h.state, id)).toBe(true);
    expect(h.state).toMatchObject({ page: "the single work" });
  });

  it("closing by the word or Escape takes the step away, so a Back afterwards is the page's own", () => {
    const h = history(nextLike);
    takeStep(h, id);
    leaveStep(h, id);
    expect(h.at()).toBe(0);
    expect(h.popped).toHaveLength(1);
    expect(isGlassStep(h.state, id)).toBe(false);
  });

  it("a glass that Back has already closed never sends the page back a second time", () => {
    const h = history(nextLike);
    takeStep(h, id);
    h.back(); // the collector pressed Back; the glass closed on the pop
    leaveStep(h, id); // and then unmounted
    expect(h.at()).toBe(0);
    expect(h.popped).toHaveLength(1);
  });

  it("a pop that lands on the glass's own step does not close it (React's development double mount)", () => {
    const h = history(nextLike);
    takeStep(h, id); // mount
    leaveStep(h, id); // development cleanup: a Back is queued…
    takeStep(h, id); // …and the effect runs again before it lands
    expect(popClosesGlass(h.state, id)).toBe(false);
    expect(popClosesGlass({ page: "the single work" }, id)).toBe(true);
  });

  it("a page reloaded while the glass was open forgets the step it arrived on, so the next Back is the page's own", () => {
    const h = history(nextLike);
    takeStep(h, id); // open…
    // …reload: the browser keeps the entry and its state; the page starts again with the glass shut.
    forgetStep(h, id);
    expect(isGlassStep(h.state, id)).toBe(false);
    expect((h.state as { __NA?: boolean }).__NA).toBe(true); // the router's own mark is kept
    expect(h.at()).toBe(1); // the entry itself stays; only the mark goes
    // A page that did not arrive on the glass's step is left exactly as it is.
    const plain = history(nextLike);
    forgetStep(plain, id);
    expect(plain.state).toMatchObject({ page: "the single work" });
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

describe("when the way out shows", () => {
  it("for 2.2 seconds after the glass opens or a hand touches it — press, drag, pinch and release alike", () => {
    expect(DWELL_MS).toBe(2200);
    expect(HAND_ON_GLASS).toEqual(["canvas-press", "canvas-drag", "canvas-pinch", "canvas-release"]);
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
