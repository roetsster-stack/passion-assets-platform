# M1-02c — The glass in the hand

_Spec drafted 10 Nov 2026 from Michael's judgement of M1-02b on his phone ("I can't get to the bottom of the
image … it wouldn't go any further … I cannot find the close button. The problem disappears if I turn the phone
sideways") and from the cold review of PR #7 (nits 3 and 4). Format: Feature Spec Kit v1.1. A fix to M1-02b,
with its own PR and its own cold review. Branch `m1-02c-glass-in-the-hand`._

## JOB
On a phone held upright, the glass opens, every edge of the work can be reached, and the way out is never
something the collector has to look for.

## THE EXPERIENCE
A collector at dinner hands her phone across the table, upright, the Kentridge on it. Her friend touches the
picture and it opens on gallery dark, whole — a landscape work lying across a tall screen, dark above and
below. For a moment the word *close* and the work's one line are there, then they fade and there is only the
work. He pinches in. The paper comes up. He drags to the horseman's hoof at the bottom edge and the picture
stops exactly there — no bounce, no fight, nothing cut off. He touches the screen and *close* is back in the
corner, large enough for a thumb. Or he does what a phone has taught him and swipes back — and is on the
single work again, where he started, not thrown out to the wall. If he turns the phone on its side mid-look,
the work settles into the new shape without losing his place.

Nothing changes on the laptop except one thing: the way out shows itself for a moment when the glass opens,
there as on the phone.

## GOOD LOOKS LIKE
- Upright phone, landscape work (the *Garibaldi*), and the reverse (a portrait work, phone on its side): at any
  zoom, all four edges of the work can be brought into view, and the picture stops at its own edge.
- The page underneath never zooms or scrolls while the glass is opening or open — one gesture, one result.
- The way out is on screen within the first two seconds of every opening, returns on any touch, and is a
  thumb's target (44 px), clear of the notch and the home bar.
- The phone's Back — button or swipe — closes the glass and leaves the collector on the single work.
- Turning the phone while the glass is open re-fits the work; closing returns to the same place on the page.
- A keyboard user lands inside the glass when it opens and back on the picture when it closes.
- A work with no tile set is still given back exactly as it came. No new chrome anywhere outside the glass.
- Michael, his own phone upright, the preview, nobody telling him where anything is: in, to the bottom edge,
  and out, first time.

## OUT OF SCOPE
- Tile size (254 → 512) and the signed manifest — parked with the numbers in M1-02 § JUDGED.
- Serving tiles closer to the collector. The Content-Security-Policy and the door's bucket check (next PR).
- Any new gesture vocabulary: no swipe-down-to-dismiss, no rotate hint, no zoom buttons.
- Ambient mode and anything about the big screen (M3-01).

## TASTE ANCHORS
Apple Photos on the phone — touch a picture, it is simply open; touch again, the way out is there. The
Rijksmuseum app's zoom: the picture stops at its edge like a thing with weight.

## OPEN TRADE-OFFS — decided in the plan below
1. How quiet the way out is on a phone.
2. What an upright phone shows first for a landscape work: all of it, small, or as much as fills the screen.
3. Whether Back closes the glass.

## PLAN — proposed 10 Nov 2026, for Michael's 70%

**First, find the cause on a phone, not in the code.** Three suspects, in the order I believe them:
1. **The page zooms underneath the glass.** A pinch on the picture opens the glass *and* is the browser's own
   zoom gesture; nothing tells the browser to stand down. Then the glass sits on a magnified page: its corners
   — the close word, the work's bottom edge — lie outside the screen, and the glass swallows the very touches
   that would scroll to them. The cold review predicted this (nit 3). It fits "it wouldn't go any further" and
   fits an upright phone, where a landscape work is small and a pinch is the natural way in.
2. **The way out never hears the touch.** *Close* and the line appear when the dialog sees a pointer move or a
   touch; OpenSeadragon handles touches on its canvas itself and may not pass them up.
3. **The pan constraint** (`visibilityRatio: 1`, `constrainDuringPan`). By my reading of OpenSeadragon 5.0.1 it
   centres a work that is smaller than the screen and stops a larger one at its edge — correct — so I expect
   to leave it alone. It is checked, not assumed.

The Workshop session reproduces the fault first (Chrome's device mode with touch, then Michael's phone on the
branch preview) and says in the PR note which suspects were real.

**Then the fix — small, all in `src/app/w/[id]/Glass.tsx` unless the cause says otherwise.**
- The picture that opens the glass tells the browser: scroll as usual, do not pinch-zoom (`touch-action:
  pan-x pan-y`); the open glass takes every touch itself (`touch-action: none`) and the page beneath holds still.
- The way out shows on open and on every touch, taking its cue from the viewer's own events as well as the
  dialog's, then fades as now. It gets a thumb-sized target and safe-area insets.
- Opening adds one step to the phone's history; Back takes it away and closes the glass. Closing by the word
  or by Escape removes the same step, so Back afterwards behaves as if the glass had never been opened.
- Focus moves into the glass on open and back to the picture on close (review nit 4).
- Tests for what is logic (the history step, when the way out shows); the rest is judged on a phone, and the
  PR note says exactly what was tried on which device.

**The three trade-offs.**
1. **The way out: appears, then fades — or always there, faint?** Proposed: **appears on open and on every
   touch, then fades**, the same rule on every device, so the work is alone on the screen while it is being
   looked at. If on the preview you hunt for it even once, it becomes always-there on touch screens; that is a
   one-line change and your call on the day.
2. **Upright phone, landscape work: whole, or filling the screen?** Proposed: **whole** — the work complete,
   dark above and below, as it hangs on the single-work page. The other way opens on a crop the collector did
   not choose. One pinch or a double tap goes in.
3. **Back closes the glass?** Proposed: **yes.** On a phone, Back is the Escape key. The cost is one piece of
   careful code beside Next's router; if it cannot be made clean, it is left out and the note says so.

**Size and order.** One small PR, a day. Built on Workshop, where a browser can show it; cold review as
always; you judge on your phone, upright, on the preview. Then the CSP PR.

**Approved — 10 Nov 2026, 11:07.** Michael: "Go." The three trade-offs stand as proposed: the way out appears
on open and on every touch, then fades; an upright phone shows a landscape work whole; Back closes the glass.

## BUILT — M1-02c (the glass in the hand), 10 Nov 2026 — revised after the cold review

**PR note — for Michael.**

**What was found, and how.** The plan said find the cause before touching the code, on a phone. I have no
phone on Workshop, so the first half was done the next best way: the real glass — the component as it is on
`main`, the real OpenSeadragon, the app's own stylesheet — put on a page shaped like the single work and
driven in Chrome 157 with its phone emulation (390 × 844, touch), with a synthesised pinch on the picture, and
a labelled 5,375 × 4,000 stand-in cut into the same pyramid as the *Garibaldi*, so a screenshot says which
edge is in view. Then the same script against the fix. The second half — your phone, upright, on the preview
— is yours, and the note below says what to look for. Of the three suspects:

1. **Real — the page magnified under the glass.** A pinch on the picture opened the glass *and* was the
   browser's own zoom. The page went to 2.5×; the visible window was 156 × 338 of the 390 × 844 screen; the
   word *close* lay outside it. The glass pans the work across the whole magnified page, so the far edge
   stopped at a place that was not on the screen — "it wouldn't go any further" — and nothing you could touch
   would move the window, because the glass takes every touch. Turning the phone re-fits the page, which is
   why sideways cured it.
2. **Not real — the way out did hear the touch.** A touch on the glass reached the dialog and brought the word
   back; it was invisible only because it was off the magnified screen. The word now also takes its cue from
   the viewer's own events, as the plan said, so a browser that handles touches differently (I could not run
   Safari here) is covered too.
3. **Not real — the pan constraint.** Zoomed in 4.3× with the page unmagnified, dragging reached the bottom
   edge exactly: the view's bottom and the work's bottom agree to four decimals, the edge drawn on the last
   row of the screen. Left alone.

Measured on the way, and fixed with the rest: the phone's Back took the whole page away rather than closing
the glass; focus never moved into the glass; the word's target was 47 × 17 px; turning the phone with the
whole work showing left it at 0.74 of the fit instead of fitting it again (the viewer keeps a picture's size
in pixels across a turn — right for a place being looked at, wrong for a work shown whole).

**Checked under `npm run dev` after the cold review, 10 Nov.** The review's blocker could not show on a
phone: it was about React's development double mount. Checked on Workshop, in the app's own development
server with Next's router, by mounting the real glass, for the check only, on the sign-in page — the one page outside
the sign-in wall — with a stand-in tile set (tiles answered 404; nothing here is about how the work looks).
- **The blocker was real.** As first pushed, one click on the picture and the glass shut itself within two
  seconds; the console showed a single pop landing on the page's own entry while the glass was open. The
  step was being taken and left in an effect's mount and cleanup, and development runs those twice.
- **The `forgetStep` finding was real.** At the moment a child's mount effect runs, `history.replaceState`
  is still the browser's own; Next's patch arrives a tick later. The first build's `forgetStep` wrote a bare
  entry and relied on that patch to put the router's marks back; on a reload it would have left the entry
  bare, and the next Back onto it would have been one Next answers with a full reload.
- **After the fixes, in the same place:** a click opens the glass and it stays open; the entry carries the
  router's two marks and the glass's; Escape closes it, focus is back on the picture, and the entry is the
  page's own; Back closes it on the same address; a reload while open arrives with the glass shut, the mark
  gone and the router's marks kept; Forward onto the step the word left behind arrives with the mark gone,
  and a glass opened from there closes on one Back; a tap in the corner while the word is away lands on the
  viewer and only brings the word back, which takes touches from half a second later; the first Tab lands on
  the viewer's own canvas, the second on *close*, the third leaves the dialog.
- **What this was not:** the single-work page itself (it needs a signed-in session), Safari, or a phone.

**What changed** — one component, one small module of logic, its tests. Nothing on the server, nothing in
the database, no new dependency.
- The picture that opens the glass tells the browser: scroll as usual, never magnify. First built as
  `touch-action: pan-x pan-y`; after the phone (second round, below) it is `touch-action: manipulation`,
  which turns off the browser's double tap in every engine, with the browser's pinch refused as it begins
  by a listener of the picture's own. The open glass takes every touch itself (`touch-action: none`), so
  the page beneath holds still — on iPhone too, where hiding the page's scrollbar alone was never enough —
  and it is fitted to what is visible of the page, not to the layout viewport (second round).
- The way out shows as the glass opens, on every device, and at every touch — the dialog's own and the
  viewer's (press, drag, pinch, release) — then fades after 2.2 s as before. The word sits where it did; the
  target around it is now 79 × 44 px, a thumb's, and keeps clear of the notch and the home bar on phones
  that report them. A hand may take it only once it can be seen: for half a second after it comes (the time
  it takes to appear) and never while it is away, a touch in that corner goes to the glass and brings the
  word back. So the first touch only brings the word back; the next one closes. A double tap in the corner
  zooms, as anywhere else. A keyboard reaches the word regardless.
- Opening takes one step in the phone's history; Back takes it away and that closes the glass, leaving you on
  the single work. Closing by the word or by Escape takes the same step away, so a Back afterwards is the
  page's own. The step is taken and left in the hand's own actions — opening, closing — never in an effect.
  Every write carries the router's own marks along itself, so it is right whether or not Next's patch is in
  place yet. A page that arrives on the glass's step with the glass shut — a reload while it was open, or
  Forward onto the step the word left behind — forgets the mark. After a reload while open, one Back changes
  nothing visible (the entry is the page's own address) and the next reaches the wall; I have not found a
  way around that which does not navigate for you.
- Focus moves into the glass as it opens and back to the picture as it closes; a keyboard's focus on the
  picture now shows as a faint line around it.
- Turning the phone: a work being shown whole is fitted to the new shape again; a place being looked at is
  kept, inside the work's edges. Whether the work is whole is read again after each turn.

**After the fix, the harness script (emulated Chrome, outside the app):** the pinch on the picture opens the
glass with the page at 1×, the page not scrolled, the word on screen; the drag reaches the bottom edge on the
last row of the screen; the word fades and a touch brings it back; Back closes the glass and the address is
still the single work; Escape closes it, the page is where it was, focus is on the picture; the phone turned
with the whole work showing shows the whole work again (zoom equals the fit, where before it was 0.74 of it);
turned while zoomed in, the centre of the view is the same point of the work to three decimals.

**The three trade-offs, as approved.** The way out appears, then fades — one rule on every device. An
upright phone shows a landscape work whole, dark above and below. Back closes the glass — it is in, run in
emulated Chrome outside the app and under the development server with Next's own router; not yet in Safari or
on a phone.

**Choices made in the build** (say if any is wrong):
- Not `none` on the picture: the picture is most of the first screen, and a thumb must still be able to
  scroll the page by it. `none` goes on the open glass, where there is nothing to scroll. (First round:
  `pan-x pan-y`; second round: `manipulation` with the pinch refused — see below for why.)
- The pinch that opens the glass does not carry on into the viewer: the fingers that opened it stay with the
  picture until they lift. The glass opens whole; the next pinch goes in. That is the "whole" trade-off.
- The word becomes live half a second after it appears, not at once: that is how long it takes to fade in,
  and it is what keeps a double tap in the corner from meeting it. Anyone who has read the word has waited
  longer than that.
- A page that was *already* magnified before the picture was touched (a pinch on the caption, say): the
  first round did nothing about it; the second round fits the glass to what is visible, so the whole glass
  shows on a magnified page too. The page itself stays magnified until the collector pinches it out.
- The viewer's "a single click zooms in" stays as left after the judging.
- The pieces that are logic — the history step, the way out's clock, the rule for a turn — live in
  `src/lib/gallery/glass.ts` so they can be proved in the test runner; the component stays the one file it was.

**Tests** — `tests/gallery/glass.test.ts`, seventeen, against a browser history in miniature that stores
exactly what it is given, so what survives a write survives because the code carried it: opening adds one
step above the page's own, marked as the glass's and carrying the router's marks; under an imitation of
Next's patch the entry comes out the same; Back lands on the page's own and that closes the glass; closing
by the word takes the step away; a glass that Back has already closed never sends the page back a second
time; opened again after the word closed it, one step and none left behind; a page reloaded while the glass
was open forgets the step it arrived on and keeps the router's marks with no patch in place; Forward onto the
step the word left behind forgets the mark, and a glass opened there closes on one Back; only the glass's
own mark counts. The way out: shown from the opening for 2.2 s; a touch keeps it or brings it back; live
only half a second after it came and never while away; a word already showing stays live through the
touches that keep it; a double tap in the corner never meets it. The viewer's cues are checked against the
installed OpenSeadragon 5.0.1 source, by name. A turn re-fits a whole work and keeps a place. What is CSS or
the browser's own touch handling was measured in the harness and the development server above and is judged
on the phone. Lint, typecheck, test and build pass; the runner reports 123 tests passing and 11 skipped (the
database tests, which run only when a local Postgres is given), 134 in all.

**How to judge on the preview — your phone, upright, the *Garibaldi*, nobody telling you where anything is.**
1. Pinch on the picture. The glass opens with the whole work, dark above and below; the page behind does not
   magnify; the word *close* and the line are there for a moment, then gone.
2. Pinch in, drag to the horseman's hoof at the bottom edge. The picture stops exactly there — no bounce, no
   fight, nothing cut off. The same at the top and both sides.
3. Touch the screen. *Close* is back in the corner, big enough for a thumb. Leave it; it fades. Touch the
   corner itself while the word is away: it only comes back; touch it again and the glass closes.
4. Swipe back (or press Back). You are on the single work, where you started — not on the wall.
5. Open again; turn the phone sideways. The work settles into the new shape, whole. Pinch in, turn it back:
   the place you were looking at is still under your finger.
6. Open again; touch *close*. Now press Back: it should take you to the wall, as if the glass had never been
   opened.
7. On the laptop, nothing changes but one thing: the word shows itself for a moment when the glass opens.
   Tab to the picture, Enter, Tab twice to *close* (the first Tab lands on the viewer itself, which the arrow
   keys then pan), Escape — focus is back on the picture, with a faint line around it.
If you hunt for the word even once, say so: always-there on touch screens is a one-line change.

**Not done here.** The Content-Security-Policy and the door's bucket check (next PR, as agreed). Tile size and
the signed manifest (parked in M1-02 § JUDGED). Keeping a keyboard inside the glass: a third Tab leaves the
dialog for the links beneath it, so `aria-modal` promises more than is enforced — a focus trap, or a portal
and `inert` on the page, for a later pass. Fitting the glass to a page that was magnified before it opened.
Forward re-opening the glass. The one Back that changes nothing after a reload while open. `viewport-fit=cover`
is not set, so on an iPhone it is Safari that keeps the glass out of the notch, not the insets written here.
Safari and a real phone were not run; iOS has honoured `touch-action` since iOS 13.

## BUILT — M1-02c, second round, 10 Nov 2026 — after the phone

**PR note — for Michael.** Your three rulings from the phone (Chrome for iOS, upright), and what each
became. Everything here was checked in **WebKit** — Safari's engine — not Chromium: Playwright 1.65's WebKit
build 2388 (AppleWebKit 605.1.15, Safari user agent), with an iPhone profile the size of your phone
(440 × 956 CSS px at 3×, touch, mobile viewport), installed in a scratch folder outside the project, driving
the real component with the real OpenSeadragon and the app's own stylesheet on the stand-in page. No Xcode is
on Workshop, so no iOS Simulator. Where a claim rests on something only iOS itself does, it says so.

**Ruling 2 — "CLOSE" cropped upright, complete sideways; the glass wider than the visible screen.** The
screenshot's numbers say what happened: the page was magnified by about a tenth. A glass laid over the
*layout* viewport (440 px) on a page the browser shows at 1.1× has only 400 of those pixels on the screen;
the word, 8 px in from the right, lies in the other 40 — "CLOS". The work fitted to 440 runs off the right by
the same tenth, and its bottom edge sits in the hidden strip below, where no drag inside the glass can bring
it up. Sideways is complete because turning the phone resets the page to 1×. What magnified the page is the
one thing this round could not watch happen. The two candidates, in the order I believe them:
1. **The browser's double tap.** A double tap on the picture is the natural way in on a phone (the spec's
   own words: "one pinch or a double tap goes in"). The first tap opens the glass; the second is iOS's
   double-tap zoom, which magnifies the page to the width of the thing tapped. The picture is 405 px wide
   on a 440 px screen: that is 1.086×, which is the magnification the screenshot measures. The first round's
   `touch-action: pan-x pan-y` should, by the standard, have turned the double tap off; WebKit turns it off
   for `manipulation` and `none` only. That would be why the first fix held in Chromium and not on the phone.
2. **A pinch that strayed.** One finger off the picture, in the 18 px margin beside it or the 48 px above it,
   and the browser owns the pinch. Possible, but it would give an arbitrary magnification, not 1.086.
Neither can be made certain from here: Playwright's WebKit has no double-tap zoom and no pinch, those being
the iOS browser's own gestures above the engine. **What changed, so that it holds either way:**
- The picture is now `touch-action: manipulation` — scroll as usual, no double tap, in every engine — and
  the browser's pinch is refused by the picture itself as it begins: two fingers down, or two fingers moving,
  and WebKit's own `gesturestart`, are cancelled by a listener that is not passive (React's are, and cannot
  refuse anything). One finger is never touched: that is how the page scrolls. *Checked in WebKit:* a
  one-finger start or move on the picture is not refused; a two-finger start, a two-finger move and
  `gesturestart` are. (Synthetic events — a real two-finger pinch cannot be made in Playwright's WebKit; in
  Chromium 157's phone emulation the real pinch was refused in the first round.)
- **The glass is fitted to what is visible of the page** — `window.visualViewport`: its offset and its size,
  kept up to date as the browser reports changes — not to the layout viewport. On a page magnified by any
  means, the whole glass is on the screen: the word in its corner, the work's far edge reachable. Where a
  browser cannot say what is visible, the glass stays the layout viewport as before. *Checked in WebKit:*
  the glass's box equals the visible viewport at 1× upright (440 × 956) and after a turn (956 × 440), the
  word fully on the screen in both; at a magnification above 1× only the phone can show it.

**Ruling 1 — the bottom edge, one finger stuttering, two fingers fine.** Not certain either, and the two
candidates are both answered. (a) If the page was magnified (ruling 2), the bottom edge of the work lay in
the hidden strip of the layout viewport, and one finger on a magnified page is a gesture the browser may
take for itself — panning the page — rather than hand to the glass; two fingers it leaves alone. The fit
above puts the edge back on the screen. (b) Your suspect: a browser toolbar sliding away during a vertical
drag, the glass changing height mid-gesture, and the first round's handling — "apply the constraints after
a resize" — then fighting the hand. That handling now stands down while a hand is on the glass: the viewer
keeps the place itself and settles the view when the hand lifts. *Checked in WebKit:* zoomed 4×, a drag
toward the bottom with the viewport losing 80 px of height half-way through moves the view one way only, no
snap back, and settles inside the work's edges; and the drag reaches the bottom edge exactly (view bottom
0.7442 = work bottom 0.7442, drawn on the last row of the screen). The drag was a mouse drag: Playwright's
WebKit cannot move a touch. **If the stutter is gone on your phone now that the glass fits the screen, it was
(a); if it is there with the page at 1×, say so and it gets its own look.**

**Ruling 3 — the soft arrival.** `blendTime` 0.25 → **0.9 s**: a sharper tile now comes into focus over the
softer level beneath it for most of a second rather than a quarter. `alwaysBlend` is left off; it is the
next knob (it fades whole levels by how sharp they are, at a cost in drawing) if the arrival still steps.
The number is yours to judge on the preview; nothing else about tiles changed.

**Also from the cold review, now checked in WebKit rather than only Chromium:** a tap opens the glass with
focus inside it; the way out is shown on open, live from 0.6 s, gone and untouchable by 2.6 s; a tap in the
corner while it is away leaves the glass open and brings the word back, not yet live at 0.2 s, live at 0.9 s,
and the next tap closes with focus back on the picture; Back closes the glass on the same address; Escape
takes the step away; Forward onto the step the word left behind arrives with the mark forgotten and a glass
opened there closes on one Back; a reload while open arrives shut with the mark gone; the phone turned with
the whole work showing shows it whole again (zoom equals the fit), and turned while zoomed in keeps the same
point of the work under the centre to three decimals.

**Tests.** No new logic that a unit test can reach: the fit, the pinch guard and the hand-on-the-glass rule
are wiring to the browser, measured above. The seventeen tests stand; the runner reports 123 passing and
11 skipped, 134 in all. Lint, typecheck, test and build pass.

**How to judge on the preview — your phone, upright.** As before, and three more:
1. **Double-tap the picture.** The glass opens on the first tap; the page must not magnify under it — *close*
   complete, the work's right edge inside the screen. Then the pinch, the same.
2. **A sloppy pinch** — one finger on the picture, the other just off its edge in the dark. If the page
   magnifies, the glass should still show whole, with *close* in its corner; say if it does not.
3. **The arrival.** Pinch in on the *Garibaldi*: the sharper paper should come into focus over the softer
   one rather than step in. If it still steps, the next knob is `alwaysBlend`.
And ruling 1: one finger to the bottom edge, zoomed well in — if it reaches it cleanly now, we have the
cause; if it still stutters with *close* complete on the screen, it is the other candidate.

**What only the phone can settle.** Whether iOS's double tap or a strayed pinch was the magnifier; whether
Chrome for iOS and Safari honour the refusal of the pinch at the picture (both are WebKit; the refusal is
the documented one); how the glass fits a page at 1.1× on the device; whether the one-finger stutter is
gone; and the feel of the arrival.
