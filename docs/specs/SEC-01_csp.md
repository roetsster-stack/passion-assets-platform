# SEC-01 — The Content-Security-Policy

_Promised in M1-02 ("its own small PR next"), sized by the cold review of PR #7, nit 7: the glass needs no
nonce; the real cost is the stand-in's inline style from M1-02a. Branch `sec-01-csp`._

## BUILT — SEC-01, 16 Nov 2026 (revised 17 Nov, after the cold review)

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
  OpenSeadragon writes none (a search of its 5.0.1 build finds no `<style>` element made and no `eval`;
  it styles through the browser's object model, which no policy governs — and the live run below watched
  it do so under the policy that would have refused a `<style>`). Style *attributes* stay allowed — see
  "the cost" below.
- *Pictures:* the site's own doors, the one Cloudflare host those doors redirect to for renditions and
  tiles (named exactly: the renditions bucket, the account, the EU jurisdiction), and `data:` for the
  24 px stand-in that is written into the page and the second factor's QR code. No other host.
- *Connections:* this site, and Supabase's own address for sign-in and the second factor. Nothing else.
- Nothing may put the register in a frame; the register frames nothing; no plugins, media or workers;
  forms post here only; a page's base address cannot be moved; in production every request is upgraded
  to https.

**What the glass needed: nothing.** The review was right. The glass sets styles through the object model
and loads tiles with plain `<img>` requests through the tile door, so it is covered by the pictures rule
already. There is no nonce in `Glass.tsx`. (The one `<script>` element OpenSeadragon can make belongs to
its JSONP helper, which the glass never calls: it hands the viewer a tile source directly.)

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
  script from another host without our nonce. The preview itself is unaffected; the console is not — see
  the verification steps.

**Tests** — two files, nineteen tests.
- `tests/security/csp.test.ts`, thirteen: every directive of the live policy; that Next's own header
  reader finds our nonce; that the nonce is sixteen random bytes and never repeats; that only Supabase's
  origin and the R2 host are ever named (a path or trailing slash on the Supabase setting never leaks
  in) and never `http:`; that an unconfigured preview gets a policy with no host at all; that
  development's three allowances never reach the live policy; and that the R2 host rule agrees with the
  host `signObject` actually signs for, through the real signer.
- `tests/security/middleware.test.ts`, six, added after the cold review: the middleware itself, called
  with a stand-in Supabase, puts the policy on the response and on the forwarded request — where Next
  reads the nonce — with one nonce for both: signed out on the sign-in screen; fully signed in on the
  wall; when Supabase refreshes the session cookie on the way, the path that rebuilds the response (the
  new cookie is set and forwarded, the policy still on both); on every redirect the door answers with
  (the stranger's to sign-in, the half-signed-in's to the second factor, the member's away from sign-in);
  a new nonce for every response; and with no Supabase variables at all. Had the forwarded copy ever lost
  the policy, every script on a token-refreshed page would be refused and the page would show but do
  nothing — this file is what would fail first.

Lint, typecheck, test and build pass; the runner reports 143 tests passing and 11 skipped (the database
tests, which run only with a local Postgres), 154 in all.

**Checked under `npm run dev`, 16 Nov — with the development policy.** With two pictures and the glass
mounted for the check on the sign-in page (the one page outside the sign-in wall, with stand-ins made for
the purpose), in Chrome: the response carried the policy with a 24-character nonce, different on every
response; the redirect from `/` to `/sign-in` carried it too; every script tag with code in it carried
the header's nonce; both stand-ins painted; the glass opened, its chunk loaded under `'strict-dynamic'`,
its tile requests went through the tile door, and Escape closed it, with no violation. But that check ran
the *development* policy — which allows `eval`, inline `<style>` and the dev socket, exactly what the live
policy forbids — so it could not say whether anything writes a `<style>` element at runtime. And the tile
requests were answered 404: there was no signed-in session, and the tile door sees a cookie, not a
policy. The check that answers both is the next one.

**Checked under the live policy, 17 Nov — `npm run build && npm start`, served on 127.0.0.1:3000,
Chrome 157 headless, the same two stand-ins and the glass on the sign-in page.** What the browser
received: the policy exactly as production will send it — all eighteen directives, `upgrade-insecure-
requests` included, no `'unsafe-eval'`, no inline-`<style>` allowance, no websocket; a 24-character nonce,
different on every response, on the page and on the redirect from `/` alike; the page's twelve script
tags all carrying the header's nonce, none without; no `<style>` element in the HTML, and exactly the two
`style` attributes of the two stand-ins. In the page: the stylesheet applied (gallery dark painted); both
stand-ins painted, the matted one with its two-layer clip and its size cap resolved (`--cap-w` = 800 px);
every resource came from the page's own origin; the loopback address stayed `http:`, as the upgrade rule
leaves it. The glass: the opener answered, so Next's scripts ran under the nonce; OpenSeadragon's chunk
loaded under `'strict-dynamic'`; its canvas drew at the full 1100 × 1400 of the screen; the fit to the
visible viewport applied through the object model; 41 tile requests went through the tile door, 105 after
two turns of the wheel inside the glass; Escape closed it and focus returned to the opener. **The
violation event fired not once** — on arrival, with the glass open, after zooming, after closing — and
through all of it the document held zero `<style>` elements: OpenSeadragon writes none at runtime, under
the policy that would have refused one. What this check could not do: fetch a tile or a picture. Without
a signed-in session the tile door answers 404 and the image door redirects to sign-in, so the glass drew
its canvas over nothing; the member's path — tiles and pictures arriving from R2 — is the preview check
below. The pictures rule it would exercise is the same in development and live, and the one host it
names is the signer's, held by test.

One thing seen only at the IP address. With the page opened as `127.0.0.1:3000`, the probe's two
pictures drew two red `img-src` lines. Inside the middleware Next rewrites every loopback host to
`localhost` (`next-url.js`), so the image door's redirect to sign-in named `localhost:3000` — another
origin to a page at `127.0.0.1:3000`, and a redirect the policy must refuse. Opened as `localhost:3000`,
the same run drew no line at all. The preview has no counterpart: its host is the deployment's own, and a
signed-in member's pictures are never redirected to sign-in.

**Next's "not found" pages under the live policy — red lines that are not faults.** Two shapes, both
seen. A `notFound()` from a page (a single work whose address is not a picture's) renders Next's own
fallback inside the layout. It writes one inline `<style>` — `body{background:#fff}` and its dark twin —
which `style-src-elem 'self'` refuses, so the console shows one red `style-src-elem … inline` line; the
page itself is fine, "404 / This page could not be found" in the gallery's own ink on gallery dark, since
the refused style was the one that would have whitened it. An address matching no route at all is
answered by the prebuilt `/_not-found` page, made at build time with no nonce: its eleven script tags and
one `<style>` are all refused, the console shows a line for each, and the page is plain text — which is
all it ever was. A stranger sees neither: the door sends every unknown address to sign-in. A member
mistyping an address does. A `not-found.tsx` of our own would quiet the first and is listed below.

**How to verify on the preview.**
1. Open the wall with DevTools → Console open, then reload. The colours first, then the pictures. Red
   "Refused to…" lines naming `vercel.live` are expected: that is Vercel's preview toolbar, which this
   policy refuses. Any other "Refused" line is a fault — tell me what it names.
2. Open a work, open the glass, zoom in hard, press Escape. Tiles sharpen as you zoom; no new red lines.
3. Sign out at the foot of the wall, ask for a fresh link, follow it, enter the six digits: the wall
   opens. This is the one step that exercises the browser's own calls to Supabase under the policy (the
   connections rule), and the one that matters most. The QR code shows only on first enrolment, so you
   will not see it; the six-digit challenge takes the same path.
4. DevTools → Network → the first row (the page) → Headers: `content-security-policy` begins
   `default-src 'self'; script-src 'self' 'nonce-…'`, and its `img-src` names
   `curator-renditions.….eu.r2.cloudflarestorage.com`. Reload: the nonce changes.
5. On a single work, press → a few times, then the browser's Back. The works change, the page returns,
   no red lines.

**After the cold review (17 Nov).** Its four should-fixes and nits 2 and 3: the live policy run in a
browser and reported above (1); the verification steps corrected — the sign-in step in place of the QR
code (2), the `vercel.live` lines named as expected (3); the middleware's delivery of the policy under
test, six cases (4); the test count corrected (nit 2); the "not found" pages described (nit 3). Nits 1
and 4 were not asked for and are listed below.

**Not done here.** The stand-in as an element of its own, which would let style attributes be refused too.
A report endpoint. A `not-found.tsx` of our own. The door's bucket check from the review of PR #7 (nit 1
there) — one line in each door, a separate small change. From this review: nit 1, a line in `.env.example`
and here that a renamed renditions bucket must be set in Vercel too; nit 4, naming the R2 host only to a
fully signed-in session.
