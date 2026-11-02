import Link from "next/link";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import type { Work } from "@/lib/gallery/types";
import { Plate } from "./Plate";

/**
 * The Flow — one work per screen as you scroll, each as large as its photograph allows, the line
 * arriving on intent. One of the three hangings of the first preview (M1-03); not the wall
 * Michael chose, but kept, unwired, as the seed of M3-01's ambient mode: the single-work flow the
 * Feature Spec Kit names, with dwell, reveal and pacing still to come.
 */
export function Flow({ hero, body }: { hero: Work | null; body: Work[] }) {
  const works = hero ? [hero, ...body] : body;
  return (
    <div>
      {works.map((w, i) => (
        <section key={w.id} className="group flex min-h-[100svh] flex-col items-center justify-center px-[4vw] py-[5vh]">
          <Link id={`w-${w.id}`} href={`/w/${w.id}`} className="flex h-[84vh] w-full items-center justify-center outline-none">
            <Plate work={w} place="stage" priority={i === 0} />
          </Link>
          <p className="mt-5 text-center text-sm tracking-wide text-ink-muted opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100">
            {tombstoneLine(w)}
          </p>
        </section>
      ))}
    </div>
  );
}
