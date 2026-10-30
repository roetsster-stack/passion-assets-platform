import { SessionFromLink } from "./SessionFromLink";

export const dynamic = "force-dynamic";

export default function SessionPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <SessionFromLink />
      </div>
    </main>
  );
}
