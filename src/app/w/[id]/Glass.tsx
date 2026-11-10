"use client";

import type { Viewer as OsdViewer } from "openseadragon";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { afterTurn, cue, forgetStep, HAND_ON_GLASS, isLive, isShown, leaveStep, popClosesGlass, takeStep, type WayOut } from "@/lib/gallery/glass";
import { tileAddress } from "@/lib/gallery/picture";
import type { TileSet } from "@/lib/gallery/types";

/**
 * The glass (M1-02b; in the hand, M1-02c). Only where a tile set exists: the cursor over the
 * picture becomes a glass; a click, Enter, or a pinch opens the work full-screen on gallery dark,
 * where OpenSeadragon streams tiles of the master for the part being looked at — never the whole
 * file. The way out — the quiet word in the corner, with the work's one line — shows as the glass
 * opens and at every touch, then fades; a hand may take it only once it can be seen. Escape closes;
 * so does the word, for a hand with no keyboard; so does the phone's Back, for which the glass takes
 * one step of its own. A work without a tile set is given back exactly as it came: no glass, no
 * control, nothing that would disappoint.
 *
 * In the hand: the picture that opens the glass lets the page scroll but never magnify — not by the
 * browser's double tap (`touch-action: manipulation` turns that off in every engine; I believe WebKit
 * keeps it on under `pan-x pan-y`, which only a phone can confirm) and not by its pinch, which is
 * refused as it begins. Otherwise the gesture
 * that is the way in also magnifies the page under the glass and carries its corners off the screen —
 * which is what an upright phone did. The open glass takes every touch itself (`touch-none`), so the
 * page beneath holds still, and it is fitted to what is visible of the page rather than to the layout
 * viewport, so a page magnified by some other means still shows the whole glass. Focus goes into the
 * glass as it opens and back to the picture as it closes.
 */

export function Glass({ tileSet, line, children }: { tileSet: TileSet | null; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLDivElement>(null);
  const id = tileSet?.id ?? null;

  // The step in the history is taken and left here, in the hand's own actions — never in an effect,
  // which React runs twice in development and would open and shut the glass in the same instant.
  const openGlass = useCallback(() => {
    if (!id || open) return;
    takeStep(window.history, id);
    setOpen(true);
  }, [id, open]);
  const closeGlass = useCallback(() => {
    setOpen(false);
    if (id) leaveStep(window.history, id);
  }, [id]);

  // The history moved. Glass open: a landing anywhere but the glass's step (Back) closes it, the step
  // already gone. Glass shut: a landing on the glass's step (Forward onto the step the word left
  // behind) forgets the mark, so a glass opened from here closes on one Back.
  useEffect(() => {
    if (!id) return;
    const onPop = (e: PopStateEvent) => {
      if (open) {
        if (popClosesGlass(e.state, id)) setOpen(false);
      } else {
        forgetStep(window.history, id);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [id, open]);

  // A page that arrives on the glass's step with the glass shut — a reload while it was open — forgets
  // the mark. This runs before Next's router has patched the history, so forgetStep carries the
  // router's own marks along itself.
  useEffect(() => {
    if (id) forgetStep(window.history, id);
  }, [id]);

  // The browser's pinch on the picture is refused as it begins — two fingers down, or moving — so it
  // cannot magnify the page while the glass opens. React's own touch handlers are passive and cannot
  // refuse anything; this one is not. One finger is left alone: that is how the page scrolls.
  useEffect(() => {
    const el = opener.current;
    if (!el) return;
    const refuse = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    const refuseGesture = (e: Event) => e.preventDefault(); // WebKit's own pinch event
    el.addEventListener("touchstart", refuse, { passive: false });
    el.addEventListener("touchmove", refuse, { passive: false });
    el.addEventListener("gesturestart", refuseGesture);
    return () => {
      el.removeEventListener("touchstart", refuse);
      el.removeEventListener("touchmove", refuse);
      el.removeEventListener("gesturestart", refuseGesture);
    };
  }, [id]);

  if (!tileSet) return <>{children}</>;
  return (
    <>
      <div
        ref={opener}
        role="button"
        tabIndex={0}
        aria-label={`Open the glass: ${line}`}
        className="flex h-full w-full cursor-zoom-in touch-manipulation items-center justify-center outline-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-ink-faint"
        onClick={openGlass}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openGlass();
          }
        }}
        onTouchStart={(e) => {
          if (e.touches.length >= 2) openGlass();
        }}
      >
        {children}
      </div>
      {open && <Viewer tileSet={tileSet} line={line} onClose={closeGlass} opener={opener} />}
    </>
  );
}

function Viewer({ tileSet, line, onClose, opener }: { tileSet: TileSet; line: string; onClose: () => void; opener: RefObject<HTMLDivElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  // The way out: cued by the glass opening and by every hand on it; shown for the dwell, live once
  // it has fully appeared. `now` is moved on by a clock set to those two moments.
  const [wayOut, setWayOut] = useState<WayOut | null>(null);
  const [now, setNow] = useState(0);
  const lastCue = useRef(0);
  const show = useCallback(() => {
    // A drag is a stream of moves; one cue a tenth of a second is the same cue, without a render per move.
    const now = Date.now();
    if (now - lastCue.current < 100) return;
    lastCue.current = now;
    setWayOut((before) => cue(now, before));
  }, []);
  useEffect(() => {
    if (!wayOut) return;
    const at = (t: number) => setTimeout(() => setNow(Date.now()), Math.max(0, t - Date.now()) + 10);
    const timers = [at(wayOut.liveFrom), at(wayOut.shownUntil)];
    return () => timers.forEach(clearTimeout);
  }, [wayOut]);
  const shown = isShown(wayOut, now);
  const live = isLive(wayOut, now);

  useEffect(() => {
    // The page beneath stands still, and its own keys (the arrows, Escape to the wall) stand down.
    document.body.dataset.glass = "open";
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The way out shows as the glass opens, on every device.
    show();

    let viewer: OsdViewer | null = null;
    let gone = false;
    (async () => {
      const { default: OpenSeadragon } = await import("openseadragon");
      if (gone || !stage.current) return;
      const v = OpenSeadragon({
        element: stage.current,
        tileSources: {
          width: tileSet.width,
          height: tileSet.height,
          tileSize: tileSet.tileSize,
          tileOverlap: tileSet.tileOverlap,
          minLevel: 0,
          maxLevel: tileSet.levels - 1,
          getTileUrl: (level, x, y) => tileAddress(tileSet.id, level, x, y),
        },
        // No chrome: the gestures are the controls.
        showNavigationControl: false,
        showNavigator: false,
        // Tiles arrive by redirect from another origin; the canvas drawer shows them, WebGL could not.
        drawer: "canvas",
        crossOriginPolicy: false,
        loadTilesWithAjax: false,
        placeholderFillStyle: "#0b0b0c",
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 0.9,
        maxZoomPixelRatio: 2,
        animationTime: 0.6,
        // The soft arrival: a sharper tile comes into focus over the softer level beneath it.
        blendTime: 0.9,
        gestureSettingsMouse: { clickToZoom: true, dblClickToZoom: false, scrollToZoom: true, flickEnabled: true },
        gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true, clickToZoom: false, dblClickToZoom: true },
      });
      viewer = v;
      // A hand on the glass brings the way out back, whether or not the touch reaches the dialog.
      for (const event of HAND_ON_GLASS) v.addHandler(event, show);
      // A hand on the glass: pointers pressed on the viewer, as its own tracker counts them per kind —
      // a count that also drops for a touch the browser cancels, which raises no release.
      const handOn = () => ["touch", "mouse", "pen"].some((kind) => v.innerTracker.getActivePointersListByType(kind).contacts > 0);
      // The glass changing shape — the phone turned, a browser toolbar sliding away: OpenSeadragon keeps
      // the place and the scale. A work shown whole is fitted to the new shape again; a place being
      // looked at is kept, inside the work's edges. With a hand on the glass nothing is forced: the
      // viewer settles the view itself when the hand lifts, a drag is not fought mid-gesture, and a
      // re-fit owed from a turn made under the hand is done as it lifts.
      let whole = true;
      let turning = false;
      let owed = false;
      const wholeNow = () => afterTurn(v.viewport.getZoom(), v.viewport.getHomeZoom()) === "fit";
      const settle = () => {
        if (whole) v.viewport.goHome(true);
        else v.viewport.applyConstraints(true);
        whole = wholeNow();
      };
      v.addHandler("viewport-change", () => {
        if (!turning) whole = wholeNow();
      });
      v.addHandler("canvas-release", () => {
        if (owed && !handOn()) {
          owed = false;
          settle();
        }
      });
      v.addHandler("resize", () => {
        turning = true;
        requestAnimationFrame(() => {
          turning = false;
          if (gone) return;
          if (handOn()) {
            owed = true;
            return;
          }
          settle();
        });
      });
    })();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      gone = true;
      viewer?.destroy();
      window.removeEventListener("keydown", onKey, true);
      delete document.body.dataset.glass;
      document.body.style.overflow = overflow;
    };
  }, [tileSet, onClose, show]);

  // Focus: into the glass as it opens, back to the picture as it closes.
  useEffect(() => {
    const picture = opener.current;
    root.current?.focus({ preventScroll: true });
    return () => picture?.focus({ preventScroll: true });
  }, [opener]);

  // The glass is fitted to what is visible of the page — the visual viewport — not to the layout
  // viewport. On a page the browser has magnified (a double tap, a pinch it let through) the two
  // differ, and a glass the size of the layout viewport has its corners, the word among them, off the
  // screen. Where the browser cannot say what is visible, the glass stays the layout viewport (inset-0).
  useEffect(() => {
    const visible = window.visualViewport;
    const el = root.current;
    if (!visible || !el) return;
    const fit = () => {
      el.style.left = `${visible.offsetLeft}px`;
      el.style.top = `${visible.offsetTop}px`;
      el.style.width = `${visible.width}px`;
      el.style.height = `${visible.height}px`;
    };
    fit();
    visible.addEventListener("resize", fit);
    visible.addEventListener("scroll", fit);
    return () => {
      visible.removeEventListener("resize", fit);
      visible.removeEventListener("scroll", fit);
    };
  }, []);

  const quiet = `transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={line}
      tabIndex={-1}
      className="fixed inset-0 z-50 touch-none bg-gallery outline-none"
      onPointerMove={show}
      onTouchStart={show}
    >
      <div ref={stage} className="absolute inset-0" />
      {/* The word sits where it did (24 px in, 20 px down); the target around it is a thumb's, clear of
          the notch — and takes a touch only once the word can be seen, so a touch in the corner while
          it is faded goes to the glass and brings the word back. A keyboard reaches it regardless. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the glass"
        className={`absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] flex min-h-11 min-w-11 items-start justify-end px-4 py-3 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint hover:text-ink-muted focus-visible:opacity-100 ${live ? "pointer-events-auto" : "pointer-events-none"} ${quiet}`}
      >
        close
      </button>
      <p
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 px-6 text-center text-sm tracking-wide text-ink-muted ${quiet}`}
      >
        {line}
      </p>
    </div>
  );
}
