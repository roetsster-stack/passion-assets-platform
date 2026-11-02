import Link from "next/link";
import { chooseHero } from "@/lib/gallery/hero";
import { loadWorks } from "@/lib/gallery/load";
import { hang } from "@/lib/gallery/order";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import type { Work } from "@/lib/gallery/types";
import { Cell } from "./_gallery/Cell";
import { IntentCaption } from "./_gallery/IntentCaption";
import { Plate } from "./_gallery/Plate";

/**
 * The wall (M1-03). Past the door there is no chrome: one work fills the screen, then the body of
 * work in acquisition order, newest first, then — under one hairline — the works that have been
 * sold. Read as the signed-in person, so row-level security decides what hangs; a non-member sees
 * the empty wall.
 *
 * The hanging is the Monograph, chosen by Michael on the first preview (2 Nov 2026) from three:
 * the hero fills the viewport with nothing written on it until intent; the body of work three
 * across with generous air; captions on intent only. The Flow — one work per screen — lives on in
 * `_gallery/Flow.tsx`, unwired, as the seed of M3-01's ambient mode. The Salon was let go.
 */

export const dynamic = "force-dynamic";

export default async function Wall() {
  const works = await loadWorks();
  if (works.length === 0) return <EmptyWall />;

  const hero = chooseHero(works);
  const { held, sold } = hang(works);
  const body = hero ? held.filter((w) => w.id !== hero.id) : held;

  return (
    <main className="min-h-screen">
      {hero && <Hero work={hero} />}
      <Grid works={body} />
      {sold.length > 0 && (
        <section aria-label="Formerly in the collection" className="pb-24">
          <div className="mx-auto mb-4 flex max-w-7xl flex-col items-center gap-6 px-[6vw] pt-16">
            <span className="h-px w-full bg-ink-faint/50" aria-hidden="true" />
            <h2 className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">Formerly in the collection</h2>
          </div>
          <Grid works={sold} />
        </section>
      )}
      <footer className="flex justify-end px-6 pb-6 pt-24">
        {/* Sign out: at the end of the wall, on intent, and nowhere else. A form, so a link cannot do it. */}
        <SignOut />
      </footer>
    </main>
  );
}

function Hero({ work }: { work: Work }) {
  // The whole viewport, nothing written on it until intent.
  // The line lives in a band of its own below the work (never over it): the stage is the viewport
  // less that band, so a portrait photograph that fills the height still leaves the band clear.
  return (
    <section className="relative flex h-[100svh] w-full flex-col">
      <Link id={`w-${work.id}`} href={`/w/${work.id}`} className="flex min-h-0 w-full flex-1 items-center justify-center outline-none">
        <Plate work={work} place="stage" priority />
      </Link>
      <div className="flex h-16 shrink-0 items-center">
        <div className="w-full">
          <IntentCaption text={tombstoneLine(work)} />
        </div>
      </div>
    </section>
  );
}

function Grid({ works }: { works: Work[] }) {
  // Three across on a laptop, generous air; one column on a phone.
  return (
    <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-x-[5vw] gap-y-24 px-[6vw] py-32 sm:grid-cols-2 lg:grid-cols-3">
      {works.map((w) => (
        <Cell key={w.id} work={w} />
      ))}
    </div>
  );
}

function SignOut() {
  return (
    <form action="/sign-out" method="post">
      <button type="submit" className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
        sign out
      </button>
    </form>
  );
}

function EmptyWall() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <h1 className="text-balance text-3xl font-normal leading-tight tracking-tight text-ink sm:text-4xl">Nothing hangs here yet.</h1>
        <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted">The wall is prepared. The works arrive with the first ingest.</p>
      </div>
      <div className="fixed bottom-5 right-6">
        <SignOut />
      </div>
    </main>
  );
}
