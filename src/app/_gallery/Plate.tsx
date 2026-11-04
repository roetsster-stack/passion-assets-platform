// Not next/image: its optimiser sits outside the door. Pictures come only through /i/<id>.
import type { CSSProperties } from "react";
import { fallback, imageAddress, rungsFor, sizesFor, srcSet, standInStyle, type Place } from "@/lib/gallery/picture";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import { treatment } from "@/lib/gallery/treatment";
import type { Work } from "@/lib/gallery/types";

/**
 * One work, hung by the treatment rule. `place` says where it hangs:
 *   cell   — a place in the body of work; the picture sits inside a fixed frame so nothing breaks the grid
 *   stage  — alone on a screen (the hero, Flow, the single work): as large as the photograph allows,
 *            inside a parent of definite height
 *
 * The picture is a `<picture>`: every rung of the ladder in AVIF, the JPEG rungs beside them, and
 * `sizes` saying how wide it will hang, so the browser fetches the smallest file that is sharp on
 * its screen. The 24 px stand-in is painted beneath it from the HTML itself, so the work hangs in
 * its colour and outline before any file arrives. `saveData` (the browser's Save-Data) offers
 * nothing above 1,080.
 *
 * A matted photograph hangs on a raised mat (the image's own padding) and never past its own
 * pixels: `own-size` (globals.css) turns its pixel size into --cap-w / --cap-h at this screen's
 * density, and the allowance added for the mat is exactly the padding at each breakpoint, so the
 * content box can never exceed the cap. A work with no photograph hangs as its label.
 */

export function Plate({ work, place, priority = false, saveData = false }: { work: Work; place: Place; priority?: boolean; saveData?: boolean }) {
  const t = treatment(work.picture);
  const p = work.picture;
  const src = p ? fallback(p) : null;

  let content: React.ReactNode;
  if (t === "label" || !p || !src) {
    content = <LabelCard work={work} />;
  } else {
    const matted = t === "matted";
    const ownSize = matted ? ({ "--w": p.width ?? 0, "--h": p.height ?? 0 } as CSSProperties) : {};
    const sizing = matted
      ? place === "cell"
        ? "own-size bg-gallery-raised p-5 sm:p-6 max-w-[min(100%,calc(var(--cap-w)+2.5rem))] max-h-[min(100%,calc(var(--cap-h)+2.5rem))] sm:max-w-[min(100%,calc(var(--cap-w)+3rem))] sm:max-h-[min(100%,calc(var(--cap-h)+3rem))]"
        : "own-size bg-gallery-raised p-8 sm:p-12 max-w-[min(100%,calc(var(--cap-w)+4rem))] max-h-[min(70vh,calc(var(--cap-h)+4rem))] sm:max-w-[min(100%,calc(var(--cap-w)+6rem))] sm:max-h-[min(70vh,calc(var(--cap-h)+6rem))]"
      : t === "contained" && place === "stage"
        ? "max-h-[min(100%,70vh)] max-w-[min(100%,70vw)]"
        : "max-h-full max-w-full";
    const sizes = sizesFor(place, t, p);
    const avif = rungsFor(p, "avif", saveData);
    const jpeg = rungsFor(p, "jpeg", saveData);
    content = (
      // `contents`: the <picture> takes no box of its own, so the image sizes against its frame as before.
      <picture className="contents">
        {avif.length > 0 && <source type="image/avif" srcSet={srcSet(avif)} sizes={sizes} />}
        <img
          src={imageAddress(src)}
          srcSet={srcSet(jpeg)}
          sizes={sizes}
          alt={tombstoneLine(work)}
          width={p.width ?? src.width}
          height={p.height ?? src.height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className={`block h-auto w-auto object-contain ${sizing}`}
          style={{ ...ownSize, ...standInStyle(p.placeholder, matted) }}
        />
      </picture>
    );
  }

  if (place === "cell") {
    return (
      <div className="relative aspect-[4/5] w-full">
        <div className="absolute inset-0 flex items-center justify-center">{content}</div>
      </div>
    );
  }
  return content;
}

function LabelCard({ work }: { work: Work }) {
  return (
    <div className="flex w-full max-w-xs flex-col items-start gap-4 border border-ink-faint/40 bg-gallery-raised px-6 py-8 text-left">
      <span className="h-px w-8 bg-ink-faint" aria-hidden="true" />
      <p className="text-pretty text-sm leading-relaxed text-ink-muted">{tombstoneLine(work)}</p>
    </div>
  );
}
