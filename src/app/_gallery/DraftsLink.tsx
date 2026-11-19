import Link from "next/link";
import { loadPendingCount } from "@/lib/drafts/load";

/**
 * M2-01 · A quiet "Drafts · n" at the very end of the wall, for the owner only: the drafts table
 * shows its rows to the owner alone, so for everyone else the count is zero and there is nothing
 * here. Read as the signed-in person; the address itself is the other way in.
 */
export async function DraftsLink() {
  const n = await loadPendingCount();
  if (n === 0) return null;
  return (
    <Link href="/drafts" className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
      Drafts · {n}
    </Link>
  );
}
