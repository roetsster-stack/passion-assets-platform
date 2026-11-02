# M1-03 — The gallery: the first look

_Spec drafted 31 Oct 2026 from Michael's rulings on decision 6 (13:24: Q5 a · Q6 a · Q7 a · Q9 all three,
"it would help to be able to review options"). Format: Feature Spec Kit v1.1. Builds on M1-01 (the
register) and M1-04 (the door). M1-02 (masters, renditions, tiles) comes after and replaces nothing here
but the source of the pictures._

## JOB
A collector opens the address, passes the door, and is in front of the works — not a list of them,
not a table about them. The hold begins here.

## THE EXPERIENCE
Past the door there is no chrome. One work fills the screen edge to edge, on gallery dark: the newest
acquisition that photographs well. Nothing is written on it. Move the pointer, or touch, and a line
appears beneath it, quietly — artist, title, year — and goes again when I stop.

Scroll, and the body of work follows: the pictures themselves, three across on a laptop, in the order
they came to me, newest first. No captions until I ask (hover, focus, a touch): then the tombstone, one
line. A poor photograph is not hidden and not stretched — it hangs smaller, matted on a slightly raised
dark, shown no larger than it truly is. A work with no photograph at all hangs as its label: a small card
with the tombstone and a hairline, in its place in the order. At the end, under one hairline,
"Formerly in the collection": the works that have been sold, in the same order, the same treatment.

Tap any work and it is alone on the screen — as large as its photograph allows — with its tombstone
beneath: artist, title, year, medium, dimensions, edition; then one line about how it came — "Acquired
from Stevenson, March 2016"; then its provenance, as entered, in order. Left and right arrows walk the
collection in the same order; Escape, or a quiet word in the corner, returns to the wall at the same
place. Nothing here says what a work is worth, or where it is.

For the first look there are **three looks** to compare on the preview, switched with `?look=1|2|3`
and remembered for the visit — the same data, three hangings:
1. **Monograph** — the hero fills the viewport; the body three across with generous air; tombstones on
   intent only. _(The default; Q5 a as ruled.)_
2. **Salon** — the hero at four-fifths of the viewport with its tombstone visible beneath; the body four
   across, closer-hung.
3. **Flow** — no grid: one work per screen as you scroll, each as large as its photograph allows, the
   tombstone arriving on intent. _(Q5 c, for comparison.)_
Michael picks one on the preview; the switch is removed in the follow-up PR and the chosen look becomes
the only one.

## GOOD LOOKS LIKE
- Opens with no visible chrome: no header, no menu, no buttons, no text over the hero.
- Every work with a photograph renders; none is stretched beyond its own pixels; none breaks the grid.
  A work without a photograph renders as its label, in its place.
- The order is acquisition, newest first: dated works by the invoice date, then the undated (by year,
  then title), then the sold works under their hairline.
- The hero is the newest acquisition whose photograph is at least 1,600 px on its long side. When a
  newer, better-photographed work is ingested, it takes the wall without anyone doing anything.
- Nothing of value, price, location or ownership appears anywhere on these screens — not in the page
  source either.
- An image address copied out of the page stops working within five minutes, and never worked for
  anyone not signed in.
- Signed in as someone who is not a member, the wall is empty and every image address answers 404.
- The three looks differ only in hanging; the works, order and tombstones are identical in each.

## OUT OF SCOPE
- Zoom, the rendition ladder, DZI tiles, archival masters, the photographer's files — **M1-02**.
- Search, filters, sorting other than acquisition order, any "view by artist / medium / room".
- Editing anything. Documents, invoices, certificates on screen. Artist biographies (M2-01).
- The collector's story and work context (M2-02); structured provenance (M2-03).
- Ambient mode, sequences, the big screen (M3). The phone layout is to be correct, not designed.
- Valuation, location, status other than the sold line. Sharing of any kind.

## TASTE ANCHORS
The Phaidon monograph — print pacing, the plate given the page. Rijksstudio — dark, the work as the
only light; zoom is next door in M1-02. Apple TV aerials — the stillness, nothing asked of you; the
full version waits for M3. Avoid: the marketplace grid, the caption under everything, the toolbar.

## OPEN TRADE-OFFS — decided in the plan below
1. Pictures for the first look: serve the Airtable originals as they are, or make a rendition now?
2. How an image reaches the browser: a signed, five-minute address, or bytes streamed through our own
   function?
3. Sold works: on the wall in their place, in a tail under a hairline, or not shown?
4. Provenance on the single-work screen now, as entered — or wait for M2-03 to structure it?

---

## PLAN — proposed 31 Oct 2026, for Michael's 70%

**What the pictures are.** 131 pictures across 105 works (two sold works have none). They are what was
uploaded to Airtable: the long side runs from 424 px to 5,375 px, median 1,071 px; 35 heroes are under
800 px, 32 are 1,600 px or more; median file 238 KB, eight over 1 MB. All are already in the EU bucket
from the ingest, with width and height recorded.

**Trade-offs taken.**
1. **Originals now, renditions in M1-02.** Most pictures are small already; a rendition step would
   mostly downscale thirty files. The wall lazy-loads, the hero loads first. M1-02 brings the ladder
   (480/1080/2160/4320, AVIF + JPEG) and tiles, and the wall simply changes where it reads from.
2. **Signed addresses, five minutes, behind the door.** `/i/[image id]` is a route like any other: no
   session, no image. With a session it reads the image row as that person — row-level security decides
   whether the row exists for them — and redirects to a signed R2 address that dies in five minutes
   (`Cache-Control: private`). The bytes never pass through our function; the bucket is never public;
   `next/image` is not used (its optimiser sits outside the door). This is the architecture CLAUDE.md
   names. **Note for M1-02:** until renditions exist, the app reads the low-res sources from the masters
   bucket with a read-only key; M1-02 moves serving to `curator-renditions` and re-scopes that key.
3. **Sold works in a tail under a hairline**, same order, same treatment — part of the autobiography,
   not hidden; not on the wall you live with. A "held only" wall is one line to add if wanted.
4. **Provenance now, as entered**, in the order of the links on the work's record. It is the hold's
   story; M2-03 structures it. Lines are shown verbatim, including the messy ones — the spec kit's
   "degrade gracefully" applies to text too.

**Treatment rule (Q7 a), by the long side of the photograph:** ≥ 1,600 px — may hang full-bleed and
is hero-eligible · 1,000–1,599 px — contained, up to about 70 % of the viewport · < 1,000 px — matted on
`gallery-raised`, shown no larger than its own pixels (never upscaled past 1:1 device pixels) · none —
the label card. The rule is a pure function with tests; the thresholds are two constants.

**Pieces.** `src/app/page.tsx` — the wall (hero + body + tail), a server component reading through
row-level security · `src/app/w/[id]/page.tsx` — the single work, with arrow-key walking and Escape ·
`src/app/i/[id]/route.ts` — the image door (session → row → signed address) · `src/lib/gallery/`
(`order.ts`, `hero.ts`, `treatment.ts`, `tombstone.ts` — pure, tested) · `src/lib/images/sign.ts` —
presigned GET on R2 (adds `@aws-sdk/s3-request-presigner`, the same family as the client already in
use) · `?look=` read in a tiny component, stored in a cookie for the visit. No migration. Tests:
order, hero choice, treatment thresholds, the acquisition line, the image route's decision, and a
database test that a non-member reads zero image rows.

**Needs from Michael (once), before the preview can show pictures:**
1. Cloudflare → R2 → **Manage API tokens → Create**: name `curator-app-read`, permission **Object Read
   only**, buckets `curator-masters` and `curator-renditions`. Copy the Access Key ID and Secret.
2. Vercel → project → Settings → Environment Variables, for **Production and Preview**:
   `R2_ACCOUNT_ID` (same as in `~/curator/.env`), `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (the new
   read-only pair), `R2_JURISDICTION` = `eu`, `R2_BUCKET_MASTERS` = `curator-masters`. The write key stays
   on Workshop and never enters Vercel.
3. On the preview, with a signed-in session: open `/?look=1`, `/?look=2`, `/?look=3`, and say which hangs
   best. The follow-up PR removes the other two.

**What "done" looks like on the preview.** Sign in → one work, full-bleed, nothing written on it →
scroll → the body of work, newest first, three across, captions only on hover → a small photograph
hangs small and matted, a work without one hangs as its label → the two sold works at the end under a
hairline → tap a work → alone, tombstone, acquisition line, provenance → arrows walk, Escape returns →
copy an image address into a private window → nothing.

---

## BUILT — 31 Oct 2026

**What changed.** The holding page is gone; past the door, the collection hangs.
- **The wall (`/`).** One work fills the screen on gallery dark, with nothing written on it; move the
  pointer, touch or press a key and its line (artist, title, year) appears beneath it, then fades.
  Scroll for the body of work: newest acquisition first, captions only on hover, focus or touch.
  A sharp photograph fills its place; a mid-sized one is held back; a small one hangs small on a raised
  mat, never larger than it truly is; a work with no photograph hangs as a small label card in its place.
  Then a hairline, "Formerly in the collection", and the two sold works. Sign out sits at the very end.
- **One work (`/w/…`).** Tap any work: it is alone, as large as its photograph allows, with its
  tombstone (artist, title, year; medium, dimensions, edition), one line on how it came ("Acquired from
  …, March 2016"), and its provenance as entered. ← and → walk the collection in the wall's order;
  Escape or "the wall" (top right) returns to the same place on the wall.
- **The image door (`/i/…`).** Every picture is fetched through it. It checks the person asking against
  the database, then hands the browser a private address that stops working after five minutes. Not
  signed in: the door, like every address, sends you to the sign-in screen. Signed in but not a member,
  or not a picture that may be shown: "not found".
- **Three looks** on the same works, same order, same words: `?look=1` Monograph (the default),
  `?look=2` Salon (hero at four-fifths with its line showing, four across), `?look=3` Flow (one work per
  screen). The choice is remembered until the browser closes.

**Why.** The spec's job: open the address, pass the door, and stand in front of the works — not a list.
Nothing of value, price, location or ownership is read by these pages at all: the gallery is built on a
narrow record that has no field for them, and a test proves a row carrying them comes out without them.

**Choices made in the build, for your eye.**
- The hero is not repeated in the grid beneath it; it is in the walk (the arrows) in its proper place.
- Full-bleed shows the whole work, edge to edge in one direction, never cropped.
- The hero is the newest held work whose photograph is at least 1,600 px; if none qualified, the wall
  would simply open on the grid.
- Works withdrawn from Airtable stay in the register but do not hang.
- The R2 setting for the EU bucket is read here as well as in the ingest (PR for `m1-01-r2-jurisdiction`);
  when both are merged the two small endpoint helpers can become one.
- One new building block: `@aws-sdk/s3-request-presigner`, from the same family as the storage client
  already in use. Nothing else was added.

**Tests.** The order of the wall, the hero choice, the treatment thresholds, the tombstone and
acquisition lines, the looks, what a row may carry onto a page, the image door's decision (including
that a master is never served), and — against a real Postgres — that a non-member reads zero image
rows, even asking for one by its id, and a half-signed-in member reads none either. Lint, typecheck,
tests (69, including the database tests) and build all pass.

**Before the preview shows pictures (once).** As in the plan: create the read-only R2 key
`curator-app-read` (Object Read, on `curator-masters` and `curator-renditions`), then in Vercel, for
Production and Preview, set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (the read-only
pair) and `R2_JURISDICTION` = `eu`. (`R2_BUCKET_MASTERS` does no harm there but is not read by the app:
each picture's row names its own bucket.) Without them the wall still opens and the works are in their
places with their words, but no picture shows: every picture answers "not found", and the server log
says why.

**How to verify on the preview.**
1. Sign in (link, then authenticator). One work fills the screen; nothing is written on it. Move the
   mouse: its line appears, then fades.
2. Scroll: newest first, three across; hover a work for its line. Find a small photograph — it hangs
   small on a slightly lighter mat — and, if any, a work hanging as its label.
3. At the end: a hairline, "Formerly in the collection", the two sold works.
4. Click a work: alone, its tombstone, how it came, its provenance. Press → and ← to walk; Escape
   returns you to the same place on the wall.
5. Open `/?look=2`, then `/?look=3`, then `/` again (it stays on the last look until the browser
   closes). Say which hangs best; the follow-up PR keeps that one.
6. Right-click a picture → copy image address → open it in a private window: you get the sign-in
   screen, not the picture. Then right-click a picture → open image in new tab: the address bar shows
   a long storage address. Copy it, wait five minutes, open it again: it has stopped working.
7. View the page source (⌥⌘U) and search for a price, a room or an owner's name: none is there. Read
   the provenance lines on a few single-work screens too — they are shown as entered in Airtable, so a
   line that names a price belongs to the hygiene hour, not to the code.

**Checked — 31 Oct, cold review by a separate Claude session against `AGENTS.md`.** Verdict: merge; no
blockers. Four should-fixes, all taken in the same PR: the "no larger than it truly is" rule leaked below
640 px (the mat's allowance now follows the padding at each breakpoint) and between density steps
(1.25 / 1.75 / 2.5 dppx added); in Monograph a portrait hero that filled the height had its line over its
foot, so the line now has a band of its own and the stage is the viewport less that band; the endpoint
rule and the jurisdiction parser were duplicated between the ingest and the door — one definition now,
in the ingest's storage module; and the signed address itself is tested (host at the EU jurisdiction,
five-minute lifetime, private cache rule, never the secret). Notes taken: `next/image` is switched off in
`next.config.ts` so its optimiser can never become an unauthenticated cache; a signing failure is logged
once on the server; the middleware comment names the door's short-circuit; this note corrects two lines.
Deferred, with the reason: the picture chosen for a work is its first (hero-flagged) photograph, not its
largest — a decision for Michael; `gifted` works (none yet) would hang among the held; the read-only key's
reach over the masters bucket is re-scoped in M1-02; provenance text is shown verbatim, so step 7 of the
verify list now includes it.
