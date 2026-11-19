"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isImageId } from "@/lib/images/door";
import { createClient } from "@/lib/supabase/server";

/**
 * M2-01 · Approve, or send back with a note. One database function, called through the owner's
 * own session: it checks the owner and both factors, stamps the person and the time, and — on
 * approval — copies the text onto the artist. Anyone else, or the owner half-signed-in, is refused
 * by the database, and the refusal is shown in the database's own words. Nothing is decided here.
 */
export async function decide(formData: FormData) {
  const draft = String(formData.get("draft") ?? "");
  const artist = String(formData.get("artist") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!isImageId(draft) || !isImageId(artist) || (decision !== "approved" && decision !== "rejected")) redirect("/drafts");

  let said: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("decide_draft", { p_draft: draft, p_decision: decision, p_note: decision === "rejected" ? note || null : null });
    if (error) said = error.message;
  } catch (err) {
    said = err instanceof Error ? err.message : "the decision did not reach the database";
  }
  revalidatePath("/", "layout");
  redirect(`/drafts/${artist}${said ? `?said=${encodeURIComponent(said)}` : ""}`);
}
