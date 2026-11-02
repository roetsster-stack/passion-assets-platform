"use client";

import { useEffect } from "react";
import { LOOK_COOKIE, type Look } from "@/lib/gallery/looks";

/**
 * Remembers the look chosen with `?look=` for the visit: a session cookie, gone when the browser
 * closes. Renders nothing. Removed with the switch in the follow-up PR.
 */
export function LookMemory({ look }: { look: Look | null }) {
  useEffect(() => {
    if (look === null) return;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LOOK_COOKIE}=${look}; path=/; samesite=lax${secure}`;
  }, [look]);
  return null;
}
