# SEC-01 — The Content-Security-Policy

_Promised in M1-02 ("its own small PR next"), sized by the cold review of PR #7, nit 7: the glass needs no
nonce; the real cost is the stand-in's inline style from M1-02a. Branch `sec-01-csp`._

## BUILT — SEC-01, 16 Nov 2026

**PR note — for Michael.**

**What changed.** Every page the register answers now carries a Content-Security-Policy: the browser's own
list of what a page may run, load and talk to, so that even if some flaw ever let a stranger's words into
a page, the browser would refuse to run them as code, load them as a picture from elsewhere, or send
anything anywhere but here. Nothing you see changes. The wall, the single work and the glass look and
behave exactly as before.

**What the policy says, in plain words.**
- *Scripts:* only the site's own, and the small inline bootstrap Next writes into each page — which is
  allowed by a one-time secret (a nonce) made fresh for every response. A script that arrives with the
  nonce may load the chunks it needs; nothing else runs. No inline `onclick=` handlers at all.
- *Styles:* the site's own stylesheet. No `<style>` block may appear in a page — the app writes none, and
  OpenSeadragon writes none (the review checked its source: it styles through the browser's object
  model, which no policy governs). Style *attributes* stay allowed — see "the cost" below.
- *Pictures:* the site's own doors, the one Cloudflare host those doors redirect to for renditions and
  tiles (named exactly: the renditions bucket, the account, the EU jurisdiction), and `data:` for the
  24 px stand-in that is written into the page and the second factor's QR code. No other host.
- *Connections:* this site, and Supabase's own address for sign-in and the second factor. Nothing else.
- Nothing may put the register in a frame; the register frames nothing; no plugins, media or workers;
  forms post here only; a page's base address cannot be moved; in production every request is upgraded
  to https.

**What the glass needed: nothing.** The review was right. The glass sets styles through the object model
and loads tiles with plain `<img>` requests through the tile door, so it is covered by the pictures rule
already. There is no nonce in `Glass.tsx`.

**The cost, paid where the review said it would be.** The stand-in (M1-02a) is a `style` attribute written
on the server into every picture, and the matted treatment's size caps ride in the same attribute. No
nonce can cover an attribute — nonces only mark `<style>` and `<script>` elements. The honest options
were to allow style attributes or to rebuild the stand-in as an element of its own. This PR allows style
attributes (`style-src-attr 'unsafe-inline'`) and keeps `<style>` elements strict (`style-src-elem 'self'`).
That is the smaller half of inline CSS: an attribute can style only the element it sits on; it cannot
select other elements or read anything, which is what a `<style>` block could do. A browser too old to
know the split falls back to allowing both — every current browser knows the split. Rebuilding the
stand-in as an element is possible (a layered `<img>`, with the matted caps carried by the `<picture>`'s
own density descriptors instead of CSS variables) and is noted as a later pass; it touches a judged
surface and belongs in its own PR.

**Choices made in the build** (say if any is wrong):
- The policy lives in the middleware, not in `next.config.ts`, because the nonce must be different for
  every response. The middleware puts the policy on the response for the browser, and on the forwarded
  request for Next, which reads the nonce there and marks its own inline scripts with it. A page may
  read the nonce as `x-nonce` if it ever needs one; none does today.
- The R2 host is named exactly rather than by a wildcard, by the same rule the image doors sign with. A
  test holds the two together, so a change to one breaks the other.
- Development gets three allowances the live policy never has: `'unsafe-eval'` (React's refresh),
  inline `<style>` (Next's dev overlay) and the dev server's websocket. A test checks they are absent
  from the live policy.
- `X-Frame-Options` and the other baseline headers stay in `next.config.ts` beside the policy's
  `frame-ancestors`, for browsers that know only the former.
- No report endpoint: there is nowhere to send violation reports yet. The browser's console shows them.
- Vercel's preview toolbar, if it is switched on for the project, is not allowed by this policy: it is a
  script from another host without our nonce. The preview itself is unaffected.

**Tests** — `tests/security/csp.test.ts`, fourteen: every directive of the live policy; that Next's own
header reader finds our nonce; that the nonce is sixteen random bytes and never repeats; that only
Supabase's origin and the R2 host are ever named (a path or trailing slash on the Supabase setting never
leaks in) and never `http:`; that an unconfigured preview gets a policy with no host at all; that
development's three allowances never reach the live policy; and that the R2 host rule agrees with the
host `signObject` actually signs for, through the real signer. Lint, typecheck, test and build pass; the
runner reports 137 tests passing and 11 skipped (the database tests, which run only with a local
Postgres), 148 in all.

**Checked under `npm run dev`, 16 Nov.** With two pictures and the glass mounted for the check on the
sign-in page (the one page outside the sign-in wall, with a stand-in made for the purpose), in Chrome
with the policy enforced: the response carries the policy with a 24-character nonce, different on every
response; the redirect from `/` to `/sign-in` carries it too; every script tag with code in it carries the
same nonce as the header (23 of them; the one without is an empty tag); the HTML has no `<style>` element
and exactly the two `style` attributes of the two stand-ins; the stylesheet applies; both stand-ins
paint, the matted one with its two-layer clip and its size caps resolved. The glass opens: OpenSeadragon's
chunk loads under `'strict-dynamic'`, its canvas draws at the full size of the screen, the fit to the
visible viewport applies through the object model, 75 tile requests go through the tile door, and Escape
closes it. The browser's own violation event fired not once, before or after the glass. The single work
itself and the wall were not loaded (they need a signed-in session); nothing on them loads or runs
anything the sign-in page with the probe did not.

**How to verify on the preview.** Open the wall, then DevTools → Console: no red "Refused to…" lines, on
the wall, on a single work, and with the glass open and zoomed. DevTools → Network → the document →
Headers: `content-security-policy` begins `default-src 'self'; script-src 'self' 'nonce-…'`. Then the
things the policy must not have broken: the pictures load and the stand-in's colour shows first on a slow
connection; the second factor's QR code shows on `/mfa`; sign-out works; the glass opens, zooms and closes.

**Not done here.** The stand-in as an element of its own, which would let style attributes be refused too.
A report endpoint. The door's bucket check from the same review (nit 1) — one line in each door, a
separate small change.
