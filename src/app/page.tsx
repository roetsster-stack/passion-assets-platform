/**
 * The first-run empty state.
 *
 * "What a screen shows before there is data — a designed moment, not a blank. The first-run
 * empty state is the first impression of the whole product." (Feature Spec Kit v1.1, §3)
 *
 * Replaced by the gallery in M1-03. Until then: no chrome, one line, the wall waiting.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <h1 className="text-balance text-3xl font-normal leading-tight tracking-tight text-ink sm:text-4xl">
          Nothing hangs here yet.
        </h1>
        <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted">
          The wall is prepared. The works arrive with the first ingest.
        </p>
        <p className="mt-16 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          0 works · private
        </p>
      </div>
    </main>
  );
}
