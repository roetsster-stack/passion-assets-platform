import Link from "next/link";

/** A page with one quiet sentence on it, and the way back to the wall. */
export function Quiet({ title, line, children }: { title: string; line?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <h1 className="text-balance text-3xl font-normal leading-tight tracking-tight text-ink sm:text-4xl">{title}</h1>
        {line && <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted">{line}</p>}
        {children}
        <Link href="/" className="mt-12 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
          the wall
        </Link>
      </div>
    </main>
  );
}
