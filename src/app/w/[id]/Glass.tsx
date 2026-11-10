"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { tileAddress } from "@/lib/gallery/picture";
import type { TileSet } from "@/lib/gallery/types";

/**
 * The glass (M1-02b). Only where a tile set exists: the cursor over the picture becomes a glass;
 * a click, Enter, or a pinch opens the work full-screen on gallery dark, where OpenSeadragon
 * streams tiles of the master for the part being looked at — never the whole file. The one line
 * about the work arrives on intent and fades. Escape closes; so does the quiet word in the corner,
 * for a hand with no keyboard. A work without a tile set is given back exactly as it came: no
 * glass, no control, nothing that would disappoint.
 */

export function Glass({ tileSet, line, children }: { tileSet: TileSet | null; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!tileSet) return <>{children}</>;
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open the glass: ${line}`}
        className="flex h-full w-full cursor-zoom-in items-center justify-center outline-none"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onTouchStart={(e) => {
          if (e.touches.length >= 2) setOpen(true);
        }}
      >
        {children}
      </div>
      {open && <Viewer tileSet={tileSet} line={line} onClose={close} />}
    </>
  );
}

const DWELL_MS = 2200;

function Viewer({ tileSet, line, onClose }: { tileSet: TileSet; line: string; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [intent, setIntent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    setIntent(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIntent(false), DWELL_MS);
  }, []);

  useEffect(() => {
    // The page beneath stands still, and its own keys (the arrows, Escape to the wall) stand down.
    document.body.dataset.glass = "open";
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let viewer: { destroy(): void } | null = null;
    let gone = false;
    (async () => {
      const { default: OpenSeadragon } = await import("openseadragon");
      if (gone || !stage.current) return;
      viewer = OpenSeadragon({
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
        blendTime: 0.25,
        gestureSettingsMouse: { clickToZoom: true, dblClickToZoom: false, scrollToZoom: true, flickEnabled: true },
        gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true, clickToZoom: false, dblClickToZoom: true },
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
      if (timer.current) clearTimeout(timer.current);
      delete document.body.dataset.glass;
      document.body.style.overflow = overflow;
    };
  }, [tileSet, onClose]);

  const quiet = `transition-opacity duration-500 ${intent ? "opacity-100" : "opacity-0"}`;
  return (
    <div role="dialog" aria-modal="true" aria-label={line} className="fixed inset-0 z-50 bg-gallery" onPointerMove={show} onTouchStart={show}>
      <div ref={stage} className="absolute inset-0" />
      <button
        type="button"
        onClick={onClose}
        className={`absolute right-6 top-5 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint hover:text-ink-muted focus-visible:opacity-100 ${quiet}`}
      >
        close
      </button>
      <p aria-hidden="true" className={`pointer-events-none absolute bottom-6 left-0 right-0 text-center text-sm tracking-wide text-ink-muted ${quiet}`}>
        {line}
      </p>
    </div>
  );
}
