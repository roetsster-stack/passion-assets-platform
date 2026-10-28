"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { sent: boolean; error?: string };

/**
 * Requests the magic link. Only invited addresses can sign in (`shouldCreateUser: false`), and the
 * screen says the same thing whether or not the address is on the list — it gives nothing away.
 */
export async function requestLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { sent: false, error: "That does not look like an email address." };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { sent: false, error: "The door is not configured yet." };
  }

  const h = await headers();
  const origin = h.get("origin") ?? (h.get("host") ? `https://${h.get("host")}` : "");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  // Whatever Supabase answered — unknown address, rate limit — the person sees the same quiet line.
  // The server log keeps the reason (the code only, never the address) for whoever is verifying.
  if (error && error.code !== "otp_disabled" && error.code !== "signup_disabled") {
    console.warn(`sign-in: ${error.code ?? error.name}`);
  }
  return { sent: true };
}
