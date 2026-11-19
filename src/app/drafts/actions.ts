"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isImageId } from "@/lib/images/door";
import { createClient } from "@/lib/supabase/server";
import { codeOf } from "./said";

/**
 * M2-01 · Approve, or send back with a note. One database function, called through the owner's
 * own session: it checks the owner and both factors, stamps the person and the time, and — on
 * approval — copies the text onto the artist. Anyone else, or the owner half-signed-in, is refused
 * by the database, and the refusal is shown on the page as one of a few known sentences, chosen by a
 * short code in the address — never the text of a link someone else could write. Nothing is decided
 * here.
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
    if (error) said = codeOf(error.message);
  } catch {
    said = "failed";
  }
  revalidatePath("/", "layout");
  redirect(`/drafts/${artist}${said ? `?said=${encodeURIComponent(said)}` : ""}`);
}
