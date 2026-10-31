/* eslint-disable @next/next/no-img-element -- next/image's optimiser sits outside the door; pictures come only through /i/<id>. */
import type { CSSProperties } from "react";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import { treatment } from "@/lib/gallery/treatment";
import type { Work } from "@/lib/gallery/types";

/**
 * One work, hung by the treatment rule. `place` says where it hangs:
 *   cell   — a place in the body of work; the picture sits inside a fixed frame so nothing breaks the grid
 *   stage  — alone on a screen (the hero, Flow, the single work): as large as the photograph allows,
 *            inside a parent of definite height
 *
 * A matted photograph hangs on a raised mat (the image's own padding) and never past its own
 * pixels: `own-size` (globals.css) turns its pixel size into --cap-w / --cap-h at this screen's
 * density, and the allowance added for the mat is exactly the padding at each breakpoint, so the
 * content box can never exceed the cap. A work with no photograph hangs as its label.
 */

type Place = "cell" | "stage";

export function Plate({ work, place, priority = false }: { work: Work; place: Place; priority?: boolean }) {
  const t = treatment(work.picture);
  const p = work.picture;

  let content: React.ReactNode;
  if (t === "label" || !p) {
    content = <LabelCard work={work} />;
  } else {
    const ownSize = { "--w": p.width ?? 0, "--h": p.height ?? 0 } as CSSProperties;
    const sizing =
      t === "matted"
        ? place === "cell"
          ? "own-size bg-gallery-raised p-5 sm:p-6 max-w-[min(100%,calc(var(--cap-w)+2.5rem))] max-h-[min(100%,calc(var(--cap-h)+2.5rem))] sm:max-w-[min(100%,calc(var(--cap-w)+3rem))] sm:max-h-[min(100%,calc(var(--cap-h)+3rem))]"
          : "own-size bg-gallery-raised p-8 sm:p-12 max-w-[min(100%,calc(var(--cap-w)+4rem))] max-h-[min(70vh,calc(var(--cap-h)+4rem))] sm:max-w-[min(100%,calc(var(--cap-w)+6rem))] sm:max-h-[min(70vh,calc(var(--cap-h)+6rem))]"
        : t === "contained" && place === "stage"
          ? "max-h-[min(100%,70vh)] max-w-[min(100%,70vw)]"
          : "max-h-full max-w-full";
    content = (
      <img
        src={`/i/${p.id}`}
        alt={tombstoneLine(work)}
        width={p.width ?? undefined}
        height={p.height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={false}
        className={`block h-auto w-auto object-contain ${sizing}`}
        style={t === "matted" ? ownSize : undefined}
      />
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
