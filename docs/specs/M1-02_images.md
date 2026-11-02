# M1-02 — Images: the archival capture, the ladder, and zoom

_Spec drafted 2 Nov 2026 from the Image Pipeline Note (23 Oct), the hi-res brief to Brett, and Michael's
judgement of the first look ("more high resolution images, with some urgency"; "how the images load … once they
are heavier or users are on a slower connection"). Format: Feature Spec Kit v1.1. Builds on M1-01 (the register),
M1-04 (the door) and M1-03 (the wall and the image door)._

## JOB
The photographer's file is kept whole and never shown; every screen gets exactly the picture it can use; and
on the single work, the collector can lean in until the paper fibre shows.

## THE EXPERIENCE
Nothing on the wall changes shape. What changes is what arrives. A work hangs with its colour and outline the
instant the page opens — a soft stand-in the size of a postage stamp, already in the page — and the photograph
settles over it a moment later. On a phone the file that comes is a phone's size; on the laptop a laptop's; on
the television in the living room, the full 4K. On a slow connection the small one comes first and the sharp
one follows it; when the phone says it is saving data, the ladder stops at 1,080 and nobody notices.

On the single work, where a master exists, the cursor becomes a glass. Click, or pinch, and the work opens into
zoom: the paper's tooth, the brush's ridge, the edge of the plate — tiles of the master arriving for the part
you are looking at, never the whole file. Where no master exists yet, the work simply hangs as large as its
photograph allows, as today, and nothing offers a zoom that would disappoint.

Behind the scenes, on Workshop, the files from the 6 November shoot and from the galleries go into one folder
per work that the tool has already named; one command takes them in. The master is stored once, write-once,
checksummed, and is not addressable from the web at all. From it the ladder is cut — 480, 1,080, 2,160, 4,320
on the long side, AVIF with a JPEG beside it, never larger than the source — and, for anything 4,000 px or
more, the tile pyramid for zoom. The work's photograph on the wall becomes the master's rendition, the
Airtable snapshot steps aside, and nobody edits anything.

## GOOD LOOKS LIKE
- A master, once in, is never served: no address on the web returns its bytes, signed or otherwise; the app's
  key cannot read the bucket it lives in.
- Every rendition is cut from the best source the work has — master if present, else the Airtable
  photograph — and never upscaled: a 1,071 px photograph yields 480 and 1,071, nothing larger.
- A phone on the wall downloads no file wider than its screen needs; the laptop no 4,320 unless it is a 4K
  display; `Save-Data` caps the ladder at 1,080.
- The hero renders first; the body of work loads just ahead of the viewport; no picture pops from blank —
  the stand-in is in the HTML.
- Zoom on the Kentridge (5,375 px) reaches the fibre on a laptop and streams tiles, not the file; a work
  without a master offers no zoom control at all.
- The register knows which works have a master and which still show the Airtable snapshot; the count of each
  is in the ingest report.
- The second run of every command changes nothing; a file dropped twice is one master.

## OUT OF SCOPE
- Photographing anything; chasing galleries (people, not code — Brett's list stands).
- Colour management beyond carrying the embedded profile into renditions (sRGB out). ICC-aware viewing: later.
- Multi-view works (details, raking light, in-situ): each file is stored and ingested as its own image on the
  work; the hero is the first flat capture. Choosing among views on screen: M3.
- Gigapixel / stitched capture for the hero set: the pipeline takes any size; the capture is a separate job.
- Editing, cropping, rotating; "replace the hero" in the app (the folder on Workshop is the control for now).
- Video. Documents (invoices, COAs) stay as they are from M1-01.

## TASTE ANCHORS
Rijksstudio — the glass over the Night Watch; the canvas thread. The Phaidon plate — the picture given the
page, nothing competing. Avoid: a loading spinner; a grey box; a "zoom" button on a work that cannot zoom.

## OPEN TRADE-OFFS — decided in the plan below
1. Where the sizes are made: once, on Workshop at ingest — or on demand by a service (Cloudflare Images,
   Vercel's optimiser)?
2. How tiles reach the viewer: each tile through a door like the image door (one redirect per tile), or a
   signed manifest per zoom session?
3. Formats: AVIF and JPEG both, or JPEG only?
4. How files are matched to works on Workshop: folders the tool prepares and names, or a spreadsheet the
   photographer fills in?
5. One PR or two?

---

## PLAN — proposed 2 Nov 2026, for Michael's 70%

**The 70 %** is your own rule, not a share of your time: *high-velocity decisions at 70 % information*. The plan
lists the trade-offs and my picks; you say go when you have enough to say it, not when every question is
answered. The rest gets settled on the preview, where it is cheap to be wrong.

**Trade-offs taken.**
1. **Made once, on Workshop.** `sharp` (the library Next.js itself uses) cuts the ladder and the tiles at
   ingest; the files sit in `curator-renditions`. Nothing resizes per visit, nothing is public, nothing needs a
   human per customer; the cost is encode time on Workshop (minutes for 107 works, AVIF being the slow one).
   On-demand services would mean a public or semi-public image host — against the register's security — and a
   per-view cost that scales with viewers rather than works.
2. **A tile door first, a manifest if it is slow.** `/t/<set>/<level>/<x>_<y>` answers as the image door does:
   the row decides, then a signed address (thirty minutes for tiles — a zoom session lasts). It is one route
   and one rule. Measured on the preview with the Kentridge; if the glass stutters, the single-work page hands
   OpenSeadragon a manifest of signed tile addresses for the set instead (one signing pass, no per-tile hop).
   Tiles skip the middleware's auth round-trips and rely on the database alone, as the reviewer of M1-03 noted
   the image door could.
3. **Both formats.** AVIF is roughly half the bytes of JPEG at the same quality and every current browser
   takes it; JPEG stays beside it for the rest. `<picture>` chooses; the cost is only encode time.
4. **Folders the tool prepares.** `npm run masters -- --prepare` creates, under `~/curator/masters/`, one
   folder per work named `<nn>-<Surname>-<Title>` with a hidden marker holding the work's id. Michael or Brett
   drop the photographer's files in; `npm run masters` takes everything it finds, checksums it, stores it, cuts
   the ladder and the tiles, and reports. No spreadsheet, no renaming by hand; the photographer's own naming
   (`Surname_Title_Year_view`) is kept as the original filename.
5. **Two PRs, one spec.** **M1-02a — the ladder:** masters in, renditions and stand-ins for every picture,
   `<picture>` on the wall and the single work, `Save-Data`, the key re-scoped. The wall gets visibly better
   for all 107 works the day it merges, master or not. **M1-02b — the glass:** tiles and OpenSeadragon on the
   single work, for the works that have a master. Each through the loop; a week apart at most.

**The ladder, precisely.** Long side 480 · 1,080 · 2,160 · 4,320, each only if the source is at least that
size (no upscaling; the source's own size is added as the top rung when it falls between). JPEG quality 82,
progressive; AVIF quality 50, effort 4. sRGB out, metadata stripped (no EXIF location). Stand-in: 24 px on the
long side, JPEG quality 40, as a data URI on the source image's row (~600 bytes), drawn under the picture.
Tiles: Deep Zoom (DZI), 254 px tiles, 1 px overlap, JPEG 85, for sources ≥ 4,000 px; OpenSeadragon 5 on the
single work.

**Schema (a migration).** `images` gains `derived_from_image_id` (the source this rendition or tile set was cut
from), `long_side`, `format` (`avif` | `jpeg`), `placeholder` (the stand-in, on source rows), and for tile sets
`tile_size`, `tile_overlap`, `levels`. `is_hero` moves with the best source: a master on a work becomes its
picture; the Airtable snapshot keeps its row, `is_hero` false. The ingest report gains `masters`, `renditions`,
`tileSets` and the count of works still on the Airtable snapshot.

**Pieces.** `scripts/masters.ts` (`npm run masters -- --prepare | --report`, and the run) · `src/lib/images/ladder.ts`
(sizes to cut for a source — pure, tested) · `src/lib/images/render.ts` (sharp: renditions, stand-in, tiles) ·
`src/lib/gallery/read.ts` (the picture is now the best source's ladder; `Plate` emits `<picture>` with `srcset`
and `sizes`, the stand-in beneath) · `src/app/t/[set]/[...tile]/route.ts` (the tile door) · `src/app/w/[id]`
(the glass, only when a tile set exists) · the ingest (`npm run ingest`) cuts the ladder for new Airtable
pictures too, so the two commands agree. Dependencies added: `sharp`, `openseadragon`. Tests: the ladder
rule (no upscaling, the top rung), the `sizes`/`srcset` composition, `Save-Data` capping, the tile door's
decision, the masters command's matching and idempotency against fixtures, and — against Postgres — that a
master row is never returned by the picture query a page uses.

**Needs from Michael.**
1. **Files.** The 6 November shoot's TIFFs, and whatever galleries have sent, into the prepared folders on
   Workshop (`~/curator/masters/<folder>/`). The 18 hi-res already on file (16 from Stevenson): wherever they
   are, the same folders. Run `npm run masters` in the Workshop session, or ask the session to.
2. **The key.** After M1-02a merges: a new read-only R2 token on `curator-renditions` **only**; its pair into
   Vercel in place of today's (Production and Preview); the old token revoked. Then no key the app holds can
   reach a master.
3. **Judge on the preview:** the wall after M1-02a (does anything pop? is the phone quick?), the glass after
   M1-02b on the Kentridge and one painting.

**What "done" looks like.** The wall opens with colour and shape before any file arrives; nothing pops · a
phone's network tab shows no picture wider than its screen · the Kentridge opens into zoom and the fibre
shows; a work without a master shows no glass · the ingest report says how many works have a master · the
masters bucket answers nothing to any address · a second `npm run masters` reports every count unchanged.
