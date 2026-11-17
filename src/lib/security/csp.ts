/**
 * SEC-01 · The Content-Security-Policy. Built once per response in the middleware, which puts it on
 * the response for the browser and on the request for Next, which marks its own inline scripts with
 * the nonce it finds there. Pure: no request, no environment read here — the middleware passes them in.
 *
 * What the register's pages actually do, and what the policy therefore allows:
 * - Scripts: Next's own, from this origin, and its inline bootstrap, by nonce. `'strict-dynamic'`
 *   lets those scripts load the chunks they need and nothing else. No inline handlers
 *   (`script-src-attr 'none'`). Development adds `'unsafe-eval'` for React's refresh.
 * - Styles: the app's stylesheet, from this origin. No `<style>` element is written by the app or by
 *   OpenSeadragon (checked in its 5.0.1 source: it styles through the CSSOM only, which no policy
 *   governs), so `style-src-elem` is this origin alone. Style *attributes* stay allowed
 *   (`style-src-attr 'unsafe-inline'`): the stand-in from M1-02a is a server-rendered `style`
 *   attribute, and no nonce can cover an attribute. That is the one cost paid here, and it is the
 *   smaller half of inline CSS: an attribute styles only its own element and cannot select others.
 *   `style-src 'self' 'unsafe-inline'` is the fallback for a browser that knows neither split
 *   directive; every current one knows them and applies the split instead.
 * - Images: this origin (the image door and the tile door, which answer with a redirect), the one
 *   R2 host those redirects lead to, and `data:` for the stand-in and the second factor's QR code.
 * - Connections: this origin, and Supabase for the browser's own auth calls. Development adds the
 *   dev server's websocket.
 * - Nothing may frame the register, nothing is framed, no plugins, no media, no workers, forms post
 *   here only, and `<base>` cannot be moved.
 */

export type Policy = {
  /** Fresh for every response: see `newNonce`. */
  nonce: string;
  /** `next dev`: React refresh evaluates code, the dev overlay writes styles, HMR talks over a socket. */
  development: boolean;
  /** A production build: every request upgraded to https. */
  production: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL — only its origin is allowed. */
  supabaseUrl?: string | null;
  /** The host the image doors' signed addresses lead to; see `renditionsHost`. */
  renditionsHost?: string | null;
};

/** A nonce of 16 random bytes, base64 — made with the Web Crypto that both Node and the Edge runtime have. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** The origin of an address, or null for anything that is not one. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The host of the renditions bucket's signed addresses: the bucket in front of the account, then the
 * jurisdiction when there is one — the same rule the signer's S3 client applies (storage.ts,
 * `r2Endpoint`, virtual-hosted buckets). Spelled out here rather than imported so the middleware
 * does not carry the AWS SDK. A test holds the two together.
 */
export function renditionsHost(env: Record<string, string | undefined>): string | null {
  const account = env.R2_ACCOUNT_ID?.trim();
  if (!account) return null;
  const bucket = env.R2_BUCKET_RENDITIONS?.trim() || "curator-renditions";
  const j = env.R2_JURISDICTION?.trim();
  const jurisdiction = j === "eu" || j === "fedramp" ? `${j}.` : "";
  return `${bucket}.${account}.${jurisdiction}r2.cloudflarestorage.com`;
}

export function contentSecurityPolicy(p: Policy): string {
  const supabase = originOf(p.supabaseUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${p.nonce}'`, "'strict-dynamic'", ...(p.development ? ["'unsafe-eval'"] : [])]],
    ["script-src-attr", ["'none'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["style-src-elem", ["'self'", ...(p.development ? ["'unsafe-inline'"] : [])]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", ...(p.renditionsHost ? [`https://${p.renditionsHost}`] : [])]],
    ["connect-src", ["'self'", ...(supabase ? [supabase] : []), ...(p.development ? ["ws:"] : [])]],
    ["font-src", ["'self'"]],
    ["media-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["worker-src", ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ...(p.production ? ([["upgrade-insecure-requests", []]] as [string, string[]][]) : []),
  ];
  return directives.map(([name, sources]) => [name, ...sources].join(" ")).join("; ");
}
