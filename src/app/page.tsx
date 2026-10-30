import { createClient } from "@/lib/supabase/server";

/**
 * The first-run empty state.
 *
 * "What a screen shows before there is data — a designed moment, not a blank. The first-run
 * empty state is the first impression of the whole product." (Feature Spec Kit v1.1, §3)
 *
 * Replaced by the gallery in M1-03. Until then: no chrome, one line, the wall waiting. The count
 * is read as the signed-in person, so row-level security decides what it is; signed out, or with
 * nothing configured, it is simply 0.
 */

export const dynamic = "force-dynamic";

async function countWorks(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase.from("items").select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function Home() {
  const works = await countWorks();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        <h1 className="text-balance text-3xl font-normal leading-tight tracking-tight text-ink sm:text-4xl">
          {works > 0 ? "The works have arrived." : "Nothing hangs here yet."}
        </h1>
        <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted">
          {works > 0 ? "The wall is prepared. The gallery comes next." : "The wall is prepared. The works arrive with the first ingest."}
        </p>
        <p className="mt-16 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          {works} {works === 1 ? "work" : "works"} · private
        </p>
      </div>
      {/* Sign out: in the corner, on intent, and nowhere else. A form, so a link cannot do it. */}
      <form action="/sign-out" method="post" className="fixed bottom-5 right-6">
        <button type="submit" className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
          sign out
        </button>
      </form>
    </main>
  );
}
