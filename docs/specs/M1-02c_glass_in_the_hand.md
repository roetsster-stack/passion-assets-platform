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

## BUILT — M1-02c (the glass in the hand), 10 Nov 2026

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
whole work showing left it at 0.46 of the fit instead of fitting it again (the viewer keeps a picture's size
in pixels across a turn — right for a place being looked at, wrong for a work shown whole).

**What changed** — one component, one small module of logic, its tests. Nothing on the server, nothing in
the database, no new dependency.
- The picture that opens the glass tells the browser: scroll as usual, never pinch-zoom (`touch-action:
  pan-x pan-y`). The open glass takes every touch itself (`touch-action: none`), so the page beneath holds
  still — on iPhone too, where hiding the page's scrollbar alone was never enough.
- The way out shows as the glass opens, on every device, and at every touch — the dialog's own and the
  viewer's (press, drag, pinch, release) — then fades after 2.2 s as before. The word sits where it did; the
  target around it is now 79 × 44 px, a thumb's, and keeps clear of the notch and the home bar on phones
  that report them.
- Opening takes one step in the phone's history; Back takes it away and that closes the glass, leaving you on
  the single work. Closing by the word or by Escape takes the same step away, so a Back afterwards is the
  page's own. Next's router keeps its own marks on the entry, so Forward never reloads. A page reloaded while
  the glass was open arrives on the glass's step with the glass shut; the mark is forgotten on arrival.
- Focus moves into the glass as it opens and back to the picture as it closes.
- Turning the phone: a work being shown whole is fitted to the new shape again; a place being looked at is
  kept, inside the work's edges.

**After the fix, the same script:** the pinch on the picture opens the glass with the page at 1×, the page
not scrolled, the word on screen; the drag reaches the bottom edge on the last row of the screen; the word
fades and a touch brings it back; Back closes the glass and the address is still the single work; Escape
closes it, the page is where it was, focus is on the picture; the phone turned with the whole work showing
shows the whole work again (zoom equals the fit, where before it was 0.46 of it); turned while zoomed in, the
centre of the view is the same point of the work to three decimals.

**The three trade-offs, as approved.** The way out appears, then fades — one rule on every device. An
upright phone shows a landscape work whole, dark above and below. Back closes the glass — it came out clean,
so it is in.

**Choices made in the build** (say if any is wrong):
- `pan-x pan-y` rather than `none` on the picture: the picture is most of the first screen, and a thumb must
  still be able to scroll the page by it. `none` goes on the open glass, where there is nothing to scroll.
- The pinch that opens the glass does not carry on into the viewer: the fingers that opened it stay with the
  picture until they lift. The glass opens whole; the next pinch goes in. That is the "whole" trade-off.
- Nothing is done about a page that was *already* magnified before the picture was touched (a pinch on the
  caption, say): the glass would then open on a magnified page, as before. The fix is at the picture, where
  the pinch that is the way in happens; a page pinched elsewhere is pinched out by the collector.
- The viewer's "a single click zooms in" stays as left after the judging.
- The pieces that are logic — the history step, the cue list, the rule for a turn — live in
  `src/lib/gallery/glass.ts` so they can be proved in the test runner; the component stays the one file it was.

**Tests** — `tests/gallery/glass.test.ts`, ten, with a browser history in miniature decorated the way Next
decorates it: opening adds one step above the page's own and keeps the router's marks; Back lands on the
page's own and that closes the glass; closing by the word takes the step away; a glass that Back has already
closed never sends the page back a second time; a pop that lands on the glass's own step does not close it
(React's development double mount); a page reloaded while the glass was open forgets the step it arrived on;
only the glass's own mark counts; the cue list and the 2.2 s; a turn re-fits a whole work and keeps a place.
What is CSS or the browser's own touch handling was measured in the harness above and is judged on the phone.
Lint, typecheck, test (115, plus the eleven database tests when a local Postgres is given) and build pass.

**How to judge on the preview — your phone, upright, the *Garibaldi*, nobody telling you where anything is.**
1. Pinch on the picture. The glass opens with the whole work, dark above and below; the page behind does not
   magnify; the word *close* and the line are there for a moment, then gone.
2. Pinch in, drag to the horseman's hoof at the bottom edge. The picture stops exactly there — no bounce, no
   fight, nothing cut off. The same at the top and both sides.
3. Touch the screen. *Close* is back in the corner, big enough for a thumb. Leave it; it fades.
4. Swipe back (or press Back). You are on the single work, where you started — not on the wall.
5. Open again; turn the phone sideways. The work settles into the new shape, whole. Pinch in, turn it back:
   the place you were looking at is still under your finger.
6. Open again; touch *close*. Now press Back: it should take you to the wall, as if the glass had never been
   opened.
7. On the laptop, nothing changes but one thing: the word shows itself for a moment when the glass opens.
   Tab to the picture, Enter, Tab once to *close*, Escape — focus is back on the picture.
If you hunt for the word even once, say so: always-there on touch screens is a one-line change.

**Not done here.** The Content-Security-Policy and the door's bucket check (next PR, as agreed). Tile size and
the signed manifest (parked in M1-02 § JUDGED). Making the page beneath inert to a screen reader while the
glass is open (the dialog is marked modal; the glass is a child of the page, so `inert` would need a portal).
Fitting the glass to a page that was magnified before it opened. Forward re-opening the glass. Safari was not
run here; iOS has honoured `touch-action` since iOS 13.
