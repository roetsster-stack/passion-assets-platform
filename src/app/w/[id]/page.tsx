import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProvenance, loadWorks } from "@/lib/gallery/load";
import { neighbours } from "@/lib/gallery/order";
import { acquisitionLine, tombstoneDetail, yearOf } from "@/lib/gallery/tombstone";
import { isImageId } from "@/lib/images/door";
import { Plate } from "../../_gallery/Plate";
import { WalkKeys } from "./WalkKeys";

/**
 * The single work (M1-03): alone on the screen, as large as its photograph allows, its tombstone
 * beneath; then one line about how it came; then its provenance, as entered, in order. The arrows
 * walk the collection in the wall's order; Escape — or the quiet word in the corner — returns to
 * the wall at the same place. Nothing here says what a work is worth, or where it is.
 */

export const dynamic = "force-dynamic";

export default async function SingleWork({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isImageId(id)) notFound();

  const [works, provenance] = await Promise.all([loadWorks(), loadProvenance(id)]);
  const work = works.find((w) => w.id === id);
  if (!work) notFound();

  const { previous, next } = neighbours(works, id);
  const back = `/#w-${work.id}`;
  const year = yearOf(work);
  const acquired = acquisitionLine(work);
  const detail = tombstoneDetail(work);

  return (
    <main className="min-h-screen">
      <WalkKeys previous={previous ? `/w/${previous.id}` : null} next={next ? `/w/${next.id}` : null} back={back} />
      <Link
        href={back}
        className="fixed right-6 top-5 z-10 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted"
      >
        the wall
      </Link>

      <figure className="flex flex-col items-center">
        <div className="flex h-[88svh] w-full items-center justify-center px-[4vw] pt-[5vh]">
          <Plate work={work} place="stage" priority />
        </div>
        <figcaption className="mt-10 flex w-full max-w-xl flex-col items-center px-6 text-center">
          {work.artist && <p className="text-lg text-ink">{work.artist}</p>}
          <p className="mt-1 text-lg text-ink">
            {work.title && <span className="italic">{work.title}</span>}
            {work.title && year && ", "}
            {year}
          </p>
          {detail.length > 0 && (
            <div className="mt-4 space-y-1 text-sm leading-relaxed text-ink-muted">
              {detail.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
          {work.sold && <p className="mt-4 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">Formerly in the collection</p>}
        </figcaption>
      </figure>

      {(acquired || provenance.length > 0) && (
        <section className="mx-auto mt-16 flex w-full max-w-xl flex-col items-center px-6 pb-32 text-center">
          <span className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
          {acquired && <p className="text-sm text-ink-muted">{acquired}</p>}
          {provenance.length > 0 && (
            <ol aria-label="Provenance" className="mt-8 space-y-2 text-pretty text-sm leading-relaxed text-ink-muted">
              {provenance.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      <nav aria-label="Walk the collection" className="flex justify-between px-6 pb-8 pt-8 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
        {previous ? (
          <Link href={`/w/${previous.id}`} className="transition-colors hover:text-ink-muted" aria-keyshortcuts="ArrowLeft">
            ← previous
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/w/${next.id}`} className="transition-colors hover:text-ink-muted" aria-keyshortcuts="ArrowRight">
            next →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
