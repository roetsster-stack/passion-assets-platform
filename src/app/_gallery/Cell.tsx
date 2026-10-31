import Link from "next/link";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import type { Work } from "@/lib/gallery/types";
import { Plate } from "./Plate";

/**
 * A place in the body of work. No caption until asked: hover, focus or a touch brings the one-line
 * tombstone. The anchor lets the single-work screen return to the wall at the same place.
 */
export function Cell({ work }: { work: Work }) {
  return (
    <Link
      id={`w-${work.id}`}
      href={`/w/${work.id}`}
      className="group block scroll-mt-24 outline-none"
      aria-label={tombstoneLine(work)}
    >
      <Plate work={work} place="cell" />
      <p className="mt-4 min-h-[1.25rem] text-pretty text-center text-[13px] leading-snug text-ink-muted opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
        {tombstoneLine(work)}
      </p>
    </Link>
  );
}
