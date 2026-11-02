"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The line under the hero, on intent: move the pointer or touch and it appears, quietly; stop and
 * it goes again. Nothing is written on the work until then. Keyboard focus shows it too.
 */
export function IntentCaption({ text, idleMs = 2200 }: { text: string; idleMs?: number }) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wake = () => {
      setShown(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(false), idleMs);
    };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("keydown", wake);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idleMs]);

  return (
    <p
      aria-live="off"
      className={`pointer-events-none text-center text-sm tracking-wide text-ink-muted transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`}
    >
      {text}
    </p>
  );
}
