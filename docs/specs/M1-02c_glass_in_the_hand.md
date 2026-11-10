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
