/**
 * SEC-01 · the middleware delivers the policy: on the response for the browser, and on the forwarded
 * request for Next, which reads the nonce there and marks its own inline scripts with it. One nonce
 * for both — also when Supabase refreshes the session cookie on the way (the path that rebuilds the
 * response), and on every redirect the door answers with. The likeliest way to break every page is
 * for the forwarded copy to lose the policy: every script would then be refused, and the page would
 * show but nothing on it would work. This file is what would catch that.
 */
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, renditionsHost } from "@/lib/security/csp";
import { middleware } from "@/middleware";

type Cookie = { name: string; value: string; options: Record<string, unknown> };
type Says = { user: { id: string } | null; level: "aal1" | "aal2" | null; refresh: Cookie[] };

/** What Supabase will say for the next request, and which cookies it refreshes while saying it. */
const supabase = vi.hoisted((): Says => ({ user: null, level: null, refresh: [] }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, { cookies }: { cookies: { setAll(c: Cookie[]): void } }) => ({
    auth: {
      async getUser() {
        // A refreshed token arrives the way @supabase/ssr delivers it: through setAll, mid-request.
        if (supabase.refresh.length) cookies.setAll(supabase.refresh);
        return { data: { user: supabase.user } };
      },
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: supabase.level } };
        },
      },
    },
  }),
}));

const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-the-test", R2_ACCOUNT_ID: "acct", R2_JURISDICTION: "eu" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  Object.assign(process.env, env);
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
beforeEach(() => {
  supabase.user = null;
  supabase.level = null;
  supabase.refresh = [];
});

const request = (path: string) => new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { cookie: "sb-test-auth-token=old" } });
const refreshed: Cookie = { name: "sb-test-auth-token", value: "new", options: { path: "/", httpOnly: true, sameSite: "lax" } };

/** The policy on a response: present, with a nonce Next's own reader finds, and exactly the module's policy for that nonce. */
function policyOn(response: Response) {
  const header = response.headers.get("content-security-policy");
  expect(header).toBeTruthy();
  const nonce = getScriptNonceFromHeader(header!);
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  const expected = contentSecurityPolicy({
    nonce: nonce!,
    development: process.env.NODE_ENV === "development",
    production: process.env.NODE_ENV === "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    renditionsHost: renditionsHost(process.env),
  });
  expect(header).toBe(expected);
  return { header: header!, nonce: nonce! };
}

/** The forwarded request, as Next receives it: the headers the middleware overrode, by name. */
function forwarded(response: Response) {
  expect(response.headers.get("x-middleware-next")).toBe("1");
  const names = (response.headers.get("x-middleware-override-headers") ?? "").split(",");
  return { names, csp: response.headers.get("x-middleware-request-content-security-policy"), nonce: response.headers.get("x-middleware-request-x-nonce"), cookie: response.headers.get("x-middleware-request-cookie") };
}

describe("the middleware delivers the policy", () => {
  it("signed out, on the sign-in screen: on the response, and on the forwarded request with the same nonce — where Next reads it", async () => {
    const response = await middleware(request("/sign-in"));
    expect(response.status).toBe(200);
    const { header, nonce } = policyOn(response);
    const f = forwarded(response);
    expect(f.names).toEqual(expect.arrayContaining(["content-security-policy", "x-nonce"]));
    expect(f.csp).toBe(header);
    expect(f.nonce).toBe(nonce);
  });

  it("fully signed in, through to the wall: the same, and the session cookie travels on the forwarded request", async () => {
    supabase.user = { id: "member" };
    supabase.level = "aal2";
    const response = await middleware(request("/"));
    expect(response.status).toBe(200);
    const { header, nonce } = policyOn(response);
    const f = forwarded(response);
    expect(f.csp).toBe(header);
    expect(f.nonce).toBe(nonce);
    expect(f.cookie).toContain("sb-test-auth-token=old");
  });

  it("a token refreshed on the way rebuilds the response: the new cookie is set and forwarded, and the policy is still on both, one nonce", async () => {
    supabase.user = { id: "member" };
    supabase.level = "aal2";
    supabase.refresh = [refreshed];
    const response = await middleware(request("/w/00000000-0000-4000-8000-000000000001"));
    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new");
    const { header, nonce } = policyOn(response);
    const f = forwarded(response);
    expect(f.csp).toBe(header);
    expect(f.nonce).toBe(nonce);
    expect(f.cookie).toContain("sb-test-auth-token=new");
    expect(f.cookie).not.toContain("sb-test-auth-token=old");
  });

  it("every redirect carries it — the stranger's to sign-in, the half-signed-in's to the second factor, the member's away from sign-in", async () => {
    const stranger = await middleware(request("/"));
    expect(stranger.status).toBe(307);
    expect(new URL(stranger.headers.get("location")!).pathname).toBe("/sign-in");
    policyOn(stranger);

    supabase.user = { id: "member" };
    supabase.level = "aal1";
    supabase.refresh = [refreshed];
    const half = await middleware(request("/"));
    expect(half.status).toBe(307);
    expect(new URL(half.headers.get("location")!).pathname).toBe("/mfa");
    policyOn(half);
    // the refreshed cookie rides the redirect too
    expect(half.cookies.get("sb-test-auth-token")?.value).toBe("new");

    supabase.level = "aal2";
    supabase.refresh = [];
    const member = await middleware(request("/sign-in"));
    expect(member.status).toBe(307);
    expect(new URL(member.headers.get("location")!).pathname).toBe("/");
    policyOn(member);
  });

  it("the nonce is new for every response, and the response's and the forwarded request's never differ", async () => {
    const a = await middleware(request("/sign-in"));
    const b = await middleware(request("/sign-in"));
    const na = policyOn(a).nonce;
    const nb = policyOn(b).nonce;
    expect(na).not.toBe(nb);
    expect(forwarded(a).nonce).toBe(na);
    expect(forwarded(b).nonce).toBe(nb);
  });

  it("unconfigured (no Supabase variables): the policy still goes out, naming no Supabase host", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      const response = await middleware(request("/sign-in"));
      expect(response.status).toBe(200);
      const { header } = policyOn(response);
      expect(header).not.toContain("supabase.co");
      expect(forwarded(response).csp).toBe(header);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    }
  });
});
