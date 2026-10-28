/**
 * The door's decision, as a pure function so it can be tested without a browser or a database.
 *
 * Two steps prove a person: the magic link (assurance level aal1) and the authenticator code
 * (aal2). Nothing of the collection renders below aal2 — the screens enforce it here, and the
 * database enforces it again in row-level security.
 */

export type AssuranceLevel = "aal1" | "aal2";

export type DoorState = {
  /** The path being requested, e.g. "/" or "/sign-in". */
  path: string;
  /** Is there a session at all? */
  signedIn: boolean;
  /** The level the current session has reached; null when signed out. Whether a factor is
   *  enrolled yet does not matter here: the second-factor screen enrols or challenges itself. */
  currentLevel: AssuranceLevel | null;
};

export type Decision = { kind: "allow" } | { kind: "redirect"; to: "/sign-in" | "/mfa" | "/" };

/** Routes reachable without any session. */
export const PUBLIC_PATHS = new Set(["/sign-in", "/auth/confirm", "/auth/session"]);

/** Routes reachable with a session that has not yet passed the second factor. */
export const FIRST_FACTOR_PATHS = new Set(["/mfa", "/sign-out"]);

export function decide(s: DoorState): Decision {
  const isPublic = PUBLIC_PATHS.has(s.path);
  const isFirstFactor = FIRST_FACTOR_PATHS.has(s.path);

  if (!s.signedIn) {
    return isPublic ? { kind: "allow" } : { kind: "redirect", to: "/sign-in" };
  }

  const fullySignedIn = s.currentLevel === "aal2";

  if (!fullySignedIn) {
    // Signed in by the link only. The second-factor screen (enrol or challenge) and sign-out are
    // the only places to go; everything else — including the public sign-in screen — leads there.
    return isFirstFactor ? { kind: "allow" } : { kind: "redirect", to: "/mfa" };
  }

  // Fully signed in: the sign-in and second-factor screens have nothing to offer; go to the wall.
  if (s.path === "/sign-in" || s.path === "/mfa") return { kind: "redirect", to: "/" };
  return { kind: "allow" };
}
