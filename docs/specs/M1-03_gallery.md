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
