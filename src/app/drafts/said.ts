/**
 * M2-01 · What the database said when a decision was refused, as a short code in the address and a
 * known sentence on the page — so a link anyone could write (`/drafts/<id>?said=…`) can put none of
 * their own words in the owner's status line (the review of PR #14).
 */

export const SAID: Record<string, string> = {
  refused: "The database refused: only the collection's owner, signed in with both factors, may decide a draft.",
  decided: "This draft was already decided.",
  note: "A rejection carries a note: say what to change.",
  placeholder: "The list's own sentence is not a text to approve: send it back with a note, or leave it for later.",
  failed: "The decision did not reach the database. Try again in a moment.",
};

/** The code for the database's own sentence; anything unexpected is "failed". */
export function codeOf(message: string): string {
  if (/only the collection's owner/.test(message)) return "refused";
  if (/already decided/.test(message)) return "decided";
  if (/a rejection carries a note/.test(message)) return "note";
  if (/not a text to approve/.test(message)) return "placeholder";
  return "failed";
}

/** The sentence for a code from the address, or nothing for a code that is not one of ours. */
export const sentenceFor = (code: string | undefined): string | null => (code && Object.hasOwn(SAID, code) ? SAID[code] : null);
