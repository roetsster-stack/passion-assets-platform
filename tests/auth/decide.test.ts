import { describe, expect, it } from "vitest";
import { decide, type DoorState } from "@/lib/auth/decide";
import { config as middlewareConfig } from "@/middleware";

const out = (path: string): DoorState => ({ path, signedIn: false, currentLevel: null });
const linkOnly = (path: string): DoorState => ({ path, signedIn: true, currentLevel: "aal1" });
const fully = (path: string): DoorState => ({ path, signedIn: true, currentLevel: "aal2" });

describe("the door — where a request may go", () => {
  it("signed out: only the sign-in screen and the two link handlers; everything else goes to sign-in", () => {
    expect(decide(out("/sign-in"))).toEqual({ kind: "allow" });
    expect(decide(out("/auth/confirm"))).toEqual({ kind: "allow" });
    expect(decide(out("/auth/session"))).toEqual({ kind: "allow" });
    for (const p of ["/", "/mfa", "/sign-out", "/works/abc", "/anything/at/all", "/api/anything"]) {
      expect(decide(out(p)), p).toEqual({ kind: "redirect", to: "/sign-in" });
    }
  });

  it("signed in by the link only: the second-factor screen and sign-out, nothing else — not even sign-in", () => {
    expect(decide(linkOnly("/mfa"))).toEqual({ kind: "allow" });
    expect(decide(linkOnly("/sign-out"))).toEqual({ kind: "allow" });
    for (const p of ["/", "/sign-in", "/works/abc", "/auth/confirm", "/auth/session"]) {
      expect(decide(linkOnly(p)), p).toEqual({ kind: "redirect", to: "/mfa" });
    }
  });

  it("fully signed in: through; the sign-in and second-factor screens lead to the wall", () => {
    for (const p of ["/", "/works/abc", "/sign-out", "/auth/confirm"]) {
      expect(decide(fully(p)), p).toEqual({ kind: "allow" });
    }
    expect(decide(fully("/sign-in"))).toEqual({ kind: "redirect", to: "/" });
    expect(decide(fully("/mfa"))).toEqual({ kind: "redirect", to: "/" });
  });

  it("never lets a signed-out request through to a non-public path, whatever the level claims", () => {
    expect(decide({ path: "/", signedIn: false, currentLevel: "aal2" })).toEqual({ kind: "redirect", to: "/sign-in" });
  });
});

describe("the door's reach — the middleware matcher", () => {
  // Next compiles the matcher with path-to-regexp; the one pattern used here is a single
  // parameter with a custom regex, which compiles to exactly this.
  const [pattern] = middlewareConfig.matcher;
  const inner = pattern.match(/^\/\((.*)\)$/)?.[1];
  const re = new RegExp(`^/(${inner})$`);

  it("is one pattern of the expected shape", () => {
    expect(middlewareConfig.matcher).toHaveLength(1);
    expect(inner).toBeTruthy();
  });

  it("covers every route of the register", () => {
    for (const p of ["/", "/sign-in", "/mfa", "/sign-out", "/auth/confirm", "/auth/session", "/works/abc", "/api/anything", "/_next/data/x.json"]) {
      expect(re.test(p), p).toBe(true);
    }
  });

  it("excludes only Next's own assets and the favicon", () => {
    for (const p of ["/_next/static/chunks/main.js", "/_next/image?url=x", "/favicon.ico"]) {
      expect(re.test(p), p).toBe(false);
    }
  });
});
