/**
 * SEC-01 · the Content-Security-Policy: what it allows and refuses, that the nonce is one Next itself
 * can find, that the one image host it names is the host the image doors actually sign for, and
 * that development's allowances never reach a production policy.
 */
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import { describe, expect, it } from "vitest";
import { signObject } from "@/lib/images/sign";
import { contentSecurityPolicy, newNonce, originOf, renditionsHost } from "@/lib/security/csp";

const nonce = "dGVzdC1ub25jZS0xNmJ5dGVz";
const live = { nonce, development: false, production: true, supabaseUrl: "https://abcdefghij.supabase.co", renditionsHost: "curator-renditions.acct.eu.r2.cloudflarestorage.com" };
const directive = (policy: string, name: string) => policy.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(name + " "));
const sources = (policy: string, name: string) => directive(policy, name)?.split(/\s+/).slice(1) ?? null;

describe("the policy, live", () => {
  const policy = contentSecurityPolicy(live);

  it("scripts: this origin and Next's own inline bootstrap by nonce, which loads the rest; no inline handlers, no eval", () => {
    expect(sources(policy, "script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(sources(policy, "script-src-attr")).toEqual(["'none'"]);
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("Next finds that nonce in the header, with its own reader", () => {
    expect(getScriptNonceFromHeader(policy)).toBe(nonce);
  });

  it("styles: the app's stylesheet; no <style> element; style attributes allowed — the stand-in's cost, named", () => {
    expect(sources(policy, "style-src-elem")).toEqual(["'self'"]);
    expect(sources(policy, "style-src-attr")).toEqual(["'unsafe-inline'"]);
    // The fallback for a browser without the split directives, which every current one has.
    expect(sources(policy, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("images: this origin, the one R2 host the doors redirect to, and data: for the stand-in and the QR code", () => {
    expect(sources(policy, "img-src")).toEqual(["'self'", "data:", "https://curator-renditions.acct.eu.r2.cloudflarestorage.com"]);
  });

  it("connections: this origin and Supabase's origin only — a path or a trailing slash on the setting never leaks in", () => {
    expect(sources(policy, "connect-src")).toEqual(["'self'", "https://abcdefghij.supabase.co"]);
    expect(sources(contentSecurityPolicy({ ...live, supabaseUrl: "https://abcdefghij.supabase.co/auth/v1/" }), "connect-src")).toEqual(["'self'", "https://abcdefghij.supabase.co"]);
    expect(sources(contentSecurityPolicy({ ...live, supabaseUrl: "not an address" }), "connect-src")).toEqual(["'self'"]);
    expect(originOf(undefined)).toBeNull();
  });

  it("nothing frames the register, nothing is framed, no plugins, media or workers; forms post here; <base> stays; https upgraded", () => {
    expect(sources(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(sources(policy, "frame-src")).toEqual(["'none'"]);
    expect(sources(policy, "object-src")).toEqual(["'none'"]);
    expect(sources(policy, "media-src")).toEqual(["'none'"]);
    expect(sources(policy, "worker-src")).toEqual(["'none'"]);
    expect(sources(policy, "form-action")).toEqual(["'self'"]);
    expect(sources(policy, "base-uri")).toEqual(["'self'"]);
    expect(sources(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
  });

  it("names no host but Supabase's and R2's, and never http:", () => {
    const hosts = policy.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(hosts.sort()).toEqual(["https://abcdefghij.supabase.co", "https://curator-renditions.acct.eu.r2.cloudflarestorage.com"]);
    expect(policy).not.toMatch(/\bhttp:/);
    expect(policy).not.toContain("ws:");
  });

  it("unconfigured (a preview with no variables yet): no host at all, and the rest unchanged", () => {
    const bare = contentSecurityPolicy({ nonce, development: false, production: true, supabaseUrl: undefined, renditionsHost: null });
    expect(sources(bare, "img-src")).toEqual(["'self'", "data:"]);
    expect(sources(bare, "connect-src")).toEqual(["'self'"]);
    expect(sources(bare, "script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
  });
});

describe("the policy, in development", () => {
  const dev = contentSecurityPolicy({ ...live, development: true, production: false });

  it("adds eval for React's refresh, inline <style> for the dev overlay, and the dev server's socket — and nothing else", () => {
    expect(sources(dev, "script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'unsafe-eval'"]);
    expect(sources(dev, "style-src-elem")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(sources(dev, "connect-src")).toEqual(["'self'", "https://abcdefghij.supabase.co", "ws:"]);
    expect(directive(dev, "upgrade-insecure-requests")).toBeUndefined();
    expect(sources(dev, "style-src-attr")).toEqual(sources(contentSecurityPolicy(live), "style-src-attr"));
    expect(sources(dev, "img-src")).toEqual(sources(contentSecurityPolicy(live), "img-src"));
  });
});

describe("the nonce", () => {
  it("is sixteen random bytes in base64, different every time", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
    expect(getScriptNonceFromHeader(contentSecurityPolicy({ ...live, nonce: a }))).toBe(a);
  });
});

describe("the one image host", () => {
  const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "AKIATESTKEYID", R2_SECRET_ACCESS_KEY: "test-secret-never-in-a-policy", R2_BUCKET_RENDITIONS: "curator-renditions" };

  it("is the host the image doors sign for (the signer keeps one client, so one configuration a process: the live one, EU)", async () => {
    Object.assign(process.env, env, { R2_JURISDICTION: "eu" });
    const signed = new URL(await signObject("curator-renditions", "collections/c/items/i/renditions/r.jpg", "image/jpeg", 300));
    expect(signed.host).toBe("curator-renditions.acct.eu.r2.cloudflarestorage.com");
    expect(renditionsHost(process.env)).toBe(signed.host);
  });

  it("follows the signer's rule without a jurisdiction and with the other one", () => {
    expect(renditionsHost({ R2_ACCOUNT_ID: "acct" })).toBe("curator-renditions.acct.r2.cloudflarestorage.com");
    expect(renditionsHost({ R2_ACCOUNT_ID: "acct", R2_JURISDICTION: "fedramp", R2_BUCKET_RENDITIONS: "other" })).toBe("other.acct.fedramp.r2.cloudflarestorage.com");
  });

  it("is nothing when the account is not set, and never the masters bucket", () => {
    expect(renditionsHost({})).toBeNull();
    expect(renditionsHost({ R2_ACCOUNT_ID: " " })).toBeNull();
    expect(renditionsHost({ R2_ACCOUNT_ID: "acct" })).not.toContain("masters");
  });
});
