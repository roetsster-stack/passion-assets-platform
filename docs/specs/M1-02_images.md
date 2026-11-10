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

---

## BUILT — M1-02a (the ladder), 3 Nov 2026

**PR note — for Michael.**

**What changed.** Every picture on the wall and the single work now arrives in the size the screen needs.
Each photograph is cut, once, on Workshop, into a ladder of sizes: 480, 1,080, 2,160 and 4,320 px on its
long side, never larger than the photograph itself, in two formats (AVIF, about half the weight, and JPEG
beside it). The page offers the browser every size and says how wide the picture will hang, and the browser
takes the smallest file that is sharp on its screen: a phone gets a phone's file, the television the 4K one.
When a phone says it is saving data, nothing above 1,080 is offered. Each work also carries a tiny stand-in
(24 px, about 600 bytes) written into the page itself, so the work appears in its colours and shape the instant
the page opens and the photograph settles over it, with no blank box and no spinner. The first picture on the
wall loads first; the rest load just before you scroll to them.

Behind the scenes there is a new command, `npm run masters`, for the photographer's and the galleries' files:
- `--prepare` keeps one folder per work in `~/curator/masters/` (the 107 folders already there are kept as
  they are).
- `--from <folder>` copies files from somewhere else (the Dropbox folder, a download) into the right work
  folders by the artist's surname and the title in the filename, and lists every file it cannot place.
  It copies and never moves, so nothing leaves Dropbox.
- `--report` says what is in the folders and what is in the archive.
- The plain run takes everything in the folders into the archive. Each file is stored once, by its
  fingerprint (the same file dropped twice is one master). The work's picture moves to the master, and the
  ladder is cut from it. The Airtable photograph keeps its place in the register but is no longer the
  picture.

`npm run ingest` cuts the ladder for the Airtable photographs too. Both commands say how many works have a
master, how many still show the Airtable snapshot, and how many have no picture yet.

**Why.** "More high resolution images, with some urgency", and the question of how the pictures load once they
are heavier or the connection is slow. Until now every screen got the same file. Now the wall is quick on a
phone and sharp on the television, and it is ready for the 6 November shoot. Zoom is the second half
(M1-02b).

**What keeps the masters safe.**
- The image door now serves renditions only. It never serves the master, and it no longer serves the
  Airtable snapshot either.
- The database itself now refuses to show a master's record to anyone signed in, member or not. The page's
  picture query returns only each work's size, its stand-in and its renditions: no storage address, and
  never a master's id.
- A test against a real database proves this. A master becomes a work's picture, and still no read that a
  signed-in member can make returns it.
- Renditions carry no metadata at all: no camera details, no GPS position, nothing about where a photograph
  was taken.

**Choices made in the build** (say if any is wrong):
- **Folder numbers stay at three digits** (`001-Adams-…`). That is how the 107 folders made earlier today were
  named, and renaming them would break the "the number never changes" promise. New works get the next free
  number.
- **Which master hangs.** When a work has several master files, the plain capture hangs. Files named
  "detail", "raking", "in situ", "verso" and so on come after it. Every file is stored; the ladder is cut for
  the one that hangs. Choosing among views on screen is M3.
- **Files it cannot take** are listed, not guessed at: a zip ("unpack it into the folder"), a RAW or PSD file,
  anything unreadable. There is one zip today, in `104-WaLehulere-Burnt-sunflowers`.
- **The picture query is a database view**, `gallery_pictures`. It runs with the database's own rights, so it
  can read a master's size and stand-in without handing out the master's record. It checks membership and the
  second sign-in step itself, with the same rule the rest of the register uses. Supabase's adviser will flag it
  as a "security definer view"; that is by design, and the database test covers it.
- **A retina laptop may take the 4,320 file** for a picture that fills the screen. Such a screen genuinely
  needs about 3,000 pixels across, and the next rung down is 2,160, which would look soft. A phone never does.

**Tests.** The ladder rule (no upscaling, the source's own size as the top rung, the 1,071 px case). What the
encoder writes (sRGB, progressive JPEG, AVIF, no EXIF/GPS/profile, a 24 px stand-in). How the page asks for a
picture (srcset by true width, `sizes`, Save-Data capping at 1,080). The door's decision (renditions only). Which
file hangs. Folder names, file matching and running `--prepare` and `--from` twice, against fixtures. Against
Postgres: the ingest cuts the ladder and a second run cuts nothing; a file dropped twice under two names is one
master; the master becomes the picture; the snapshot keeps its row; the picture query never returns the master;
a stranger, a half-signed-in member and the anonymous role see no pictures. Lint, typecheck, 97 tests and the
build pass.

**Before the preview shows pictures — one-time, in this order.**
1. **The migration** (`20261103150000_image_ladder.sql`) applied to the database
   (`npx supabase db push --db-url "$DATABASE_URL"` on Workshop). The site on `main` keeps working after it.
2. **`npm run ingest`** on Workshop, to cut the ladder for the 131 Airtable photographs into
   `curator-renditions`.
3. **The key.** The app's read-only R2 key must be able to read `curator-renditions`. The plan said to do this
   after merging, but this branch's door reads only from that bucket, so the preview needs it first. Make a new
   read-only token on `curator-renditions` **only** and put its pair in Vercel (Preview now; Production when
   this merges). When this merges, revoke the old token. After that, no key the app holds can reach a master.

**How to verify on the preview.**
1. Open the wall on the laptop. Every work should show its colours at once, and the photographs should settle
   over them. Nothing should pop from blank.
2. On the phone, scroll the wall. It should be quick.
3. To check the sizes: in Safari or Chrome, open the developer tools → Network → Img and reload. On the phone
   (or the tools' phone view) no picture should be wider than about 1,080 px. On the laptop, the body of work
   should come at 1,080 and the hero larger.
4. Open a work, then use ← and → to walk. Each picture should arrive in its colours first, as on the wall.
5. Then, on Workshop, after the shoot: put the files into the folders (or use `npm run masters -- --from
   "<the Dropbox folder>"`), run `npm run masters`, and reload the wall. Those works now hang their master's
   ladder. Run it again and every count should be "unchanged".

**Not done here.** Tiles and zoom (M1-02b). The Dropbox folder named in the brief
(`~/Library/CloudStorage/Dropbox/Art/Michael Roets - Art Images`) is not on this Mac, so `--from` has only been
tested on fixtures. Two loose files sit in `~/curator/masters/Michael Roets - Art Images/`; `--report` lists them
and `--from` can place them.

### Revised after the cold review — 4 Nov 2026

The checker's verdict was "merge after fixes": one blocker and seven should-fixes, all in the masters
command and the migration, none in the serving path. All eight are in, each with the test the review asked
for; 104 tests now.

- **The order of the run (the blocker).** The ladder is cut *first*; only then does a work's picture move
  to its master, and only if the ladder is whole. A master whose file will not cut — a layered TIFF, say,
  whose header reads but whose pixels do not — stays in the archive, is reported on every run, and the
  Airtable photograph keeps hanging. The same holds for a run interrupted halfway: the next run completes
  the ladder, and the picture moves then. Before, the picture moved first, and such a work would have hung
  as a label card with no way back.
- **Surnames with a particle** ("de Villiers", "le Roux") now match a filename with or without the particle,
  and run together.
- **The artist's one work** takes a file only when the name carries nothing but the surname, a year or a
  camera's counter. A name with a title the register does not know is listed, with the one folder it might
  belong to, and never placed by guess.
- **`--from` twice, with a different file under the same name,** keeps both, once; the third run copies
  nothing. Files are compared by their bytes, not only their size.
- **Which master hangs:** "Work.tif" now hangs before "Work (2).tif" whatever the alphabet says, and a word
  of the work's own title ("Side Door", "Back Garden") no longer makes a capture a "view".
- **The migration** first clears the second picture on any work that has two (main's ingest could leave one)
  and only then forbids it. The live database had none, so the migration already applied there is the same
  in effect; the change matters for a fresh database and for CI.
- **`--prepare` refuses** — naming them, changing nothing — when a folder named like a work folder has no
  readable marker, rather than making that work's folder again under a new number. `--report` lists such
  folders too. On Workshop, `--report` says 107 work folders and no unmarked ones.
- **The masters test** uses invented artists and titles, shaped like the real ones.

One claim in the note above is narrowed, as the review noted: a rendition's own record names the master it
was cut from, by id. That id is not an address — asking the image door for it gets 404, from the database's
rule and from the door's own — and nothing of the master's address, bucket or fingerprint is readable. The
page's picture query returns no master id at all.

---

## BUILT — M1-02b (the glass), 8 Nov 2026

**PR note — for Michael.**

**What changed.** On the single work, where the photograph is large enough, the cursor over it becomes a
glass. Click, press Enter, or pinch, and the work opens full-screen on gallery dark: lean in and the paper's
tooth, the brush's ridge, the edge of the plate come up, as tiles of the master arrive for the part you are
looking at — never the whole file. The work's one line appears when you move and fades again. Escape closes
the glass (so does the quiet word in the corner, for a hand with no keyboard). A work whose photograph is not
large enough shows nothing new at all: no glass, no control, nothing to disappoint.

Behind it, on Workshop, `npm run masters` and `npm run ingest` now also cut a *tile pyramid* for every work
whose picture is 4,000 px or more on its long side — the master if it has one, else the Airtable photograph —
into the renditions bucket: Deep Zoom, 254 px tiles, 1 px overlap, JPEG 85, recorded as one row on the work.
Below 4,000 px the ladder's 4,320 rung already shows every pixel, so no pyramid is cut. Both commands report
how many were cut and for which works; a second run cuts nothing.

A new door, `/t/<set>/<level>/<x>_<y>`, hands out each tile: the row decides, as the image door's does — read
as the person asking, so the database's rules say whether it exists for them — then a signed address that
dies in thirty minutes (a zoom session lasts). Anything else is 404. This door serves tile sets only; the
image door still serves renditions only; masters are served by neither. Tiles skip the sign-in check that
every page goes through (`src/middleware.ts` says so and why): a zoom asks for hundreds, and a round-trip to
Supabase for each would make the glass stutter. The database alone decides, with the same rule as everything
else — member, both factors. One thing the door does give up, and it is worth saying plainly: every page asks
Supabase whether the session is still live, and the tile door does not. It trusts the token the cookie carries
until that token expires, which the database checks but cannot revoke. So a session signed out somewhere else
can go on fetching tiles for up to an hour. The plan accepted that for the sake of the glass; everything else
— membership, both factors, and the refusal of anything that is not a tile — is proven on every single tile.
The exemption in the middleware is the door's own shape, not the whole `/t/` prefix, so nothing else could
ever sit there unguarded.

**Why.** The spec's job: "on the single work, the collector can lean in until the paper fibre shows." The
Rijksstudio anchor — the glass over the Night Watch, the canvas thread.

**What keeps the masters safe.** The pyramid is cut on Workshop from the master's bytes, like the ladder;
nothing on the web touches a master. The page's picture query now carries the tile set's own id and shape
and nothing of the master: no address, no id. A database test shows a non-member and a half-signed-in
member read zero tile-set rows, and that the master is still never returned by the picture query or by the
tile door's own query — not even to a member.

**Choices made in the build** (say if any is wrong):
- **OpenSeadragon 5.0.1**, pinned exactly, loaded from the package (no CDN), as the plan says. Version 6.1.1
  exists; moving to it is one line, for a later PR if the preview gives a reason.
- **The canvas drawer.** Tiles reach the browser by redirect from another origin (R2), so OpenSeadragon's
  WebGL drawer could not paint them; the canvas drawer can. No visible difference at this size.
- **The glass opens from the picture itself** — no button, no icon; the cursor is the only sign. On touch, a
  pinch on the picture opens it; inside, pinch zooms, drag pans, a double tap zooms in.
- **A quiet "close"** in the corner, on intent, because a phone has no Escape. The arrows and Escape of the
  single-work page stand down while the glass is open.
- **The set is recorded last**, after every tile is stored. A run cut short leaves no half pyramid on the
  register; the next run cuts it again, and tiles already stored are not stored twice.
- **The glass may magnify to twice the master's pixels** and no further: the fibre, not the pixels.
- **One pyramid per picture source.** If a work's picture later moves (a master arrives for a work that had a
  4,000 px Airtable photograph), the new source gets its own pyramid on the next run; the old one stays in
  the bucket, unreferenced by the page.

**Tests.** The pyramid rule (levels, tile counts, the Kentridge's 481 tiles; 1 px and 256 px edges); that what
sharp writes on disk is exactly what the rule names (levels, every tile, 255/256/93 px widths, no metadata);
the ≥ 4,000 px rule; tile addresses (digits only, inside the pyramid); the tile door's decision (a tile set
→ sign, a master or anything else → 404, a row that does not describe a whole pyramid → 404); the signed
address (thirty minutes, private); the picture's tile set travels only whole; against fixtures and Postgres:
the masters run cuts one pyramid for the 5,375 px master that hangs and none for the 4,000 px one that does
not, 481 tiles in the renditions bucket, a second run cuts nothing, the view carries the tile set and never
the master, a non-member and an aal1 member read zero tile-set rows. Lint, typecheck, 117 tests and the build
pass.

**Before the preview shows the glass — one-time.**
1. **The migration** (`20261108120000_tile_sets.sql`) applied to the database. It adds the tile set to the
   page's picture query and two guards on tile-set rows; the site on `main` keeps working after it.
2. **`npm run masters`** on Workshop — done, see "The run" below. The read-only key the app already holds reads
   `curator-renditions`, where the tiles live; nothing new in Vercel.

**How to judge the glass on the preview.**
1. Open the Kentridge *Garibaldi* (`/w/<id>`; it is the test piece). The cursor over the picture should be a
   magnifying glass. Over any work without a pyramid, the plain arrow, and nothing else different.
2. Click. The screen should go to gallery dark with the work filling it; the first tiles should arrive within
   a second on the laptop. Scroll to zoom, drag to pan; the fibre should show at full zoom.
3. Move the mouse: the work's line appears at the bottom and fades. Escape: back to the single work, where
   you were. ← and → should do nothing while the glass is open.
4. On the phone: pinch the picture to open; pinch and drag inside; the word "close" top right.
5. In the developer tools → Network, during a zoom: requests to `/t/…` each answered 307, then the tile from
   R2 — no request for the master, no request larger than a tile.

**What to watch for — if it stutters.** Each tile is one hop through the door (a database read and a
signature) and one fetch from R2. On the laptop this is well under the blend time; on a slow connection, or a
fast pan across a 5,000 px work, you may see tiles arrive late. If the glass stutters where the ladder does
not, the plan's fallback is the **signed manifest**: when the single work opens, the server signs every tile
address of the set once (thirty minutes, as now) and hands OpenSeadragon the list, so no tile goes through the
door at all — one signing pass, no per-tile hop. It changes the client's `getTileUrl` and adds one server
read; the door stays for anything else. Decide on the Kentridge and one painting.

**The run — 8 Nov 2026, on Workshop.** First `--from ~/Downloads` placed 10 files (Highriser, Hodgins, two
Kentridges, Siopis) and could not place 4 (two the title did not decide, two zips). Then the M1-02a run took 82
masters into the archive (9 more were the same bytes under another name), cut 332 renditions, and 44 works now
hang their master. Then this branch's run:

```
masters      created    0  unchanged   91
renditions   created    0  unchanged  332
tile sets    created   21  unchanged    0
works: 44 with a master, 61 on the Airtable snapshot, 2 with no picture yet; 21 open into the glass
```

The 21: van Zyl *The Waiting Room* (6,000 px) · Ruga *The Night of the Long Knives IV* (4,500) · Murray *King*
(8,256) · Halter *Kimberly Latrice Jones* (7,360) and *What is Happening in America?* (6,417) · Adams *Hennie se
kamer tapyt* (7,453) and *Melkbankie* (7,446) · Wa Lehulere *Burnt sunflowers* (7,538) · Subotzky *Johnny
Fortune* (7,016) · Siopis *Note 4* (4,000) and *Restless Republic: History* (8,747) · Mivekannin *Aprés Valloton*
(4,054) · Ige *And When Midnight Befell Us* (5,023) · Aggenbach *Fault Lines* (4,540) · Kentridge *Garibaldi*
(5,375) and *Sleeper Red* (7,846) · Botha *Cloud Study 16* (4,137), *Generic Self-portrait as an Exile* (4,992)
and *Untitled (Saturn after Rubens)* (4,651) · Blom *1.36 Untitled* (4,613) and *1.9 Untitled* (4,757). The
other 23 masters are gallery JPEGs under 4,000 px: the ladder shows every pixel they have, and no glass.

Two things to know from the run:
- **Yiadom-Boakye, *Highriser*** — a 724 MB TIFF, 7,391 × 11,866 px — is in the archive but will not cut: the
  TIFF reader refuses a 116 MB block in its header (a safety limit in libvips). The work hangs its Airtable
  photograph meanwhile. Open the file in Preview or Photoshop, save it as a plain TIFF or a JPEG, drop that in
  `106-Yiadom-Boakye-Highriser`, run `npm run masters` again.
- **One zip** in `104-WaLehulere-Burnt-sunflowers` is not taken; unpack it into the folder.

**Not done here.** The Content-Security-Policy (its own small PR next, as agreed; the stand-in needs
`img-src data:` and the glass's inline style a nonce). Choosing among views on screen (M3). A pyramid is cut
only for the source that hangs.

## JUDGED — M1-02b, 10 Nov 2026

Michael judged the glass on the preview, on the Kentridge *Garibaldi*: "it works really well, I'm more than
pleased." Merged as #7 (`c1651ef`), tagged `v0.5.0-m1-02b`. Three findings came out of the judging.

**The stutter is accepted, and the signed manifest stays parked.** On a fast line and 5G the wait to sharpen
is about a second. Rather than rule from best-case conditions, he ran the glass under Chrome's throttling:

| | requests | transferred | each 307 | each tile |
|---|---|---|---|---|
| Fast 4G | 494 | 4.1 MB | 226–295 ms | 5–26 kB, 8.4–9.3 s to settle |
| Slow 4G | 882 | 5.2 MB | ~571 ms | 4.8–11 kB, 0.6–1.1 s |

What the numbers say: **bandwidth, not the extra hop, is the ceiling** — a single zoom session moves 4–5 MB.
The door's redirect is a real fixed cost on a slow link (~570 ms before a tile's bytes begin) but it is not
the main story, and the 29-minute redirect cache does visible work (re-panned ground returns from disk in
1 ms). The manifest would remove the redirect and none of the megabytes, so it is **parked with evidence**,
not retired: build it only if a later surface is latency-bound rather than bandwidth-bound.

**A cheaper lever, for a later tuning spec.** At 254 px a zoom session asks for hundreds of tiles, each one a
redirect plus a fetch. Cutting at 512 px would quarter the request count for the same pixels and compress
slightly better; re-cutting costs nothing but a masters run. Not now — it changes every pyramid — but it is
the first thing to try if the glass ever needs to be faster. The structural lever behind it is distance:
tiles are served from Europe to a collector in Johannesburg, which costs more than any hop we control.

**One fault, on the phone, and it is a fault rather than taste.** A landscape work on an upright phone cannot
be panned to its bottom edge — the view fights and snaps back — and the close word is not findable, leaving
no visible way out on the one surface with no Escape key. Turning the phone sideways makes it right. Two
causes are likely, both small: `visibilityRatio: 1` with `constrainDuringPan` asks the viewer never to show
empty space, which a wide work in a tall viewport cannot satisfy; and the close word and caption appear only
on a pointer move or touch the dialog sees, which OpenSeadragon's own touch handling can swallow. **Its own
PR, next, with its own cold review** — not a quiet patch on a branch already checked. The fix should also
show the way out briefly whenever the glass opens, on every device.

**Left as built:** a single click inside the glass zooms in (undocumented in the note, tried and liked).
