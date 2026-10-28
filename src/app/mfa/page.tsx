import { MfaClient } from "./MfaClient";

/**
 * The second factor. First time: scan a code into an authenticator app and confirm it. After:
 * enter the six digits. The database will not show a row to a session that has not passed this.
 */
export const dynamic = "force-dynamic";

export default function MfaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <MfaClient />
        <p className="mt-16 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">private</p>
      </div>
      {/* A session that cannot finish the second factor needs a way out. */}
      <form action="/sign-out" method="post" className="fixed bottom-5 right-6">
        <button type="submit" className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
          sign out
        </button>
      </form>
    </main>
  );
}
