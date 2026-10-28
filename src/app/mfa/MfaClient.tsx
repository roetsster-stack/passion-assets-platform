"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = { kind: "loading" } | { kind: "enrol"; factorId: string; qr: string; secret: string } | { kind: "challenge"; factorId: string } | { kind: "error"; message: string };

export function MfaClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // development re-runs effects; enrol once
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: factors, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verified = factors?.totp?.find((f) => f.status === "verified");
        if (verified) {
          if (!cancelled) setMode({ kind: "challenge", factorId: verified.id });
          return;
        }
        // Clean up any half-finished enrolment from an earlier attempt, then start a fresh one.
        for (const f of factors?.all ?? []) {
          if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data: enrol, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator" });
        if (enrolError || !enrol) throw enrolError ?? new Error("Could not start enrolment");
        if (!cancelled) setMode({ kind: "enrol", factorId: enrol.id, qr: enrol.totp.qr_code, secret: enrol.totp.secret });
      } catch (e) {
        console.warn(`mfa: ${e instanceof Error ? e.message : String(e)}`);
        if (!cancelled) setMode({ kind: "error", message: "The second factor could not be set up just now. Sign out and try the link again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== "enrol" && mode.kind !== "challenge") return;
    setBusy(true);
    setWrong(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.trim() });
      if (error) {
        setWrong(true);
        setCode("");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mode.kind === "loading") return <p className="text-ink-muted">one moment</p>;
  if (mode.kind === "error") return <p className="text-pretty text-ink-muted">{mode.message}</p>;

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center gap-6">
      {mode.kind === "enrol" ? (
        <>
          <p className="text-pretty text-lg leading-relaxed text-ink">Scan this with your authenticator app, then enter the six digits it shows.</p>
          {/* Supabase returns the QR as an SVG data URL; nothing is fetched from anywhere. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="Authenticator setup code" width={176} height={176} className="rounded bg-white p-2" />
          <details className="text-xs text-ink-faint">
            <summary className="cursor-pointer">can&apos;t scan?</summary>
            <code className="mt-2 block select-all break-all font-mono text-ink-muted">{mode.secret}</code>
          </details>
        </>
      ) : (
        <p className="text-pretty text-lg leading-relaxed text-ink">The six digits from your authenticator app.</p>
      )}
      <label htmlFor="code" className="sr-only">
        Six-digit code
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-40 border-0 border-b border-ink-faint bg-transparent px-1 py-2 text-center font-mono text-2xl tracking-[0.4em] text-ink outline-none focus:border-ink-muted"
      />
      <button type="submit" disabled={busy || code.length !== 6} className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-muted transition-colors hover:text-ink disabled:opacity-50">
        {busy ? "one moment" : "continue"}
      </button>
      {wrong ? <p className="text-sm text-ink-muted">That code didn&apos;t match. Try the next one.</p> : null}
    </form>
  );
}
