import { describe, expect, it } from "vitest";
import { decide, type DoorState } from "@/lib/auth/decide";

const out = (path: string): DoorState => ({ path, signedIn: false, currentLevel: null, nextLevel: null });
const linkOnly = (path: string, nextLevel: "aal1" | "aal2" = "aal2"): DoorState => ({ path, signedIn: true, currentLevel: "aal1", nextLevel });
const fully = (path: string): DoorState => ({ path, signedIn: true, currentLevel: "aal2", nextLevel: "aal2" });

describe("the door — where a request may go", () => {
  it("signed out: only the sign-in screen and the link handler; everything else goes to sign-in", () => {
    expect(decide(out("/sign-in"))).toEqual({ kind: "allow" });
    expect(decide(out("/auth/confirm"))).toEqual({ kind: "allow" });
    for (const p of ["/", "/mfa", "/sign-out", "/works/abc", "/anything/at/all", "/api/anything"]) {
      expect(decide(out(p)), p).toEqual({ kind: "redirect", to: "/sign-in" });
    }
  });

  it("signed in by the link only: the second-factor screen and sign-out, nothing else — not even sign-in", () => {
    expect(decide(linkOnly("/mfa"))).toEqual({ kind: "allow" });
    expect(decide(linkOnly("/sign-out"))).toEqual({ kind: "allow" });
    for (const p of ["/", "/sign-in", "/works/abc", "/auth/confirm"]) {
      expect(decide(linkOnly(p)), p).toEqual({ kind: "redirect", to: "/mfa" });
    }
  });

  it("signed in by the link with no authenticator enrolled yet: the same — the second-factor screen enrols", () => {
    expect(decide(linkOnly("/", "aal1"))).toEqual({ kind: "redirect", to: "/mfa" });
    expect(decide(linkOnly("/mfa", "aal1"))).toEqual({ kind: "allow" });
  });

  it("fully signed in: through; the sign-in and second-factor screens lead to the wall", () => {
    for (const p of ["/", "/works/abc", "/sign-out", "/auth/confirm"]) {
      expect(decide(fully(p)), p).toEqual({ kind: "allow" });
    }
    expect(decide(fully("/sign-in"))).toEqual({ kind: "redirect", to: "/" });
    expect(decide(fully("/mfa"))).toEqual({ kind: "redirect", to: "/" });
  });

  it("never lets a signed-out request through to a non-public path, whatever the levels claim", () => {
    expect(decide({ path: "/", signedIn: false, currentLevel: "aal2", nextLevel: "aal2" })).toEqual({ kind: "redirect", to: "/sign-in" });
  });
});
