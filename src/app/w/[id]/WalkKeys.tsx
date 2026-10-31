"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Left and right walk the collection in the wall's order; Escape returns to the wall at the same place. */
export function WalkKeys({ previous, next, back }: { previous: string | null; next: string | null; back: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowLeft" && previous) router.push(previous);
      else if (e.key === "ArrowRight" && next) router.push(next);
      else if (e.key === "Escape") router.push(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, previous, next, back]);
  return null;
}
