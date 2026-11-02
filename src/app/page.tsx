import Link from "next/link";
import { cookies } from "next/headers";
import { chooseHero } from "@/lib/gallery/hero";
import { loadWorks } from "@/lib/gallery/load";
import { chooseLook, LOOK_COOKIE, parseLook, type Look } from "@/lib/gallery/looks";
import { hang } from "@/lib/gallery/order";
import { tombstoneLine } from "@/lib/gallery/tombstone";
import type { Work } from "@/lib/gallery/types";
import { Cell } from "./_gallery/Cell";
import { IntentCaption } from "./_gallery/IntentCaption";
import { LookMemory } from "./_gallery/LookMemory";
import { Plate } from "./_gallery/Plate";

/**
 * The wall (M1-03). Past the door there is no chrome: one work fills the screen, then the body of
 * work in acquisition order, newest first, then — under one hairline — the works that have been
 * sold. Read as the signed-in person, so row-level security decides what hangs; a non-member sees
 * the empty wall.
 *
 * Three looks for the first preview, the same works in the same order with the same words, hung
 * three ways: 1 Monograph (default), 2 Salon, 3 Flow. `?look=` switches; the visit remembers.
 */

export const dynamic = "force-dynamic";

export default async function Wall({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [works, query, jar] = await Promise.all([loadWorks(), searchParams, cookies()]);
  const look = chooseLook(query.look, jar.get(LOOK_COOKIE)?.value);
  const memory = <LookMemory look={parseLook(query.look)} />;

  if (works.length === 0) {
    return (
      <>
        {memory}
        <EmptyWall />
      </>
    );
  }

  const hero = chooseHero(works);
  const { held, sold } = hang(works);
  const body = hero ? held.filter((w) => w.id !== hero.id) : held;

  return (
    <main className="min-h-screen">
      {memory}
      {look === 3 ? (
        <Flow hero={hero} body={body} />
      ) : (
        <>
          {hero && <Hero work={hero} look={look} />}
          <Grid works={body} look={look} />
        </>
      )}
      {sold.length > 0 && (
        <section aria-label="Formerly in the collection" className="pb-24">
          <div className="mx-auto mb-4 flex max-w-7xl flex-col items-center gap-6 px-[6vw] pt-16">
            <span className="h-px w-full bg-ink-faint/50" aria-hidden="true" />
            <h2 className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">Formerly in the collection</h2>
          </div>
          {look === 3 ? <Flow hero={null} body={sold} /> : <Grid works={sold} look={look} />}
        </section>
      )}
      <footer className="flex justify-end px-6 pb-6 pt-24">
        {/* Sign out: at the end of the wall, on intent, and nowhere else. A form, so a link cannot do it. */}
        <SignOut />
      </footer>
    </main>
  );
}

function Hero({ work, look }: { work: Work; look: Look }) {
  // Monograph: the whole viewport, nothing written on it until intent. Salon: four-fifths, with
  // its tombstone beneath.
  if (look === 2) {
    return (
      <section className="flex flex-col items-center px-6 pt-[6vh]">
        <Link id={`w-${work.id}`} href={`/w/${work.id}`} className="flex h-[80vh] w-full items-center justify-center outline-none">
          <Plate work={work} place="stage" priority />
        </Link>
        <p className="mt-6 text-center text-sm tracking-wide text-ink-muted">{tombstoneLine(work)}</p>
      </section>
    );
  }
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

function Grid({ works, look }: { works: Work[]; look: Look }) {
  const hanging =
    look === 2
      ? "grid grid-cols-2 gap-x-6 gap-y-12 px-6 py-16 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-8"
      : "grid grid-cols-1 gap-x-[5vw] gap-y-24 px-[6vw] py-32 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`mx-auto max-w-[1800px] ${hanging}`}>
      {works.map((w) => (
        <Cell key={w.id} work={w} />
      ))}
    </div>
  );
}

function Flow({ hero, body }: { hero: Work | null; body: Work[] }) {
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
