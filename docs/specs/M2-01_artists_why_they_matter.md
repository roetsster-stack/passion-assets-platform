# M2-01 — Artists, and why they matter

_Spec drafted 17 Nov 2026; revised 18 Nov with Michael's direction after reading the first five drafts ("accurate, if
not comprehensive"; the texts must not end up dry): three voices, and a richer brief, built into the desk by M2-04b
first. From the MVP plan (§6 M2-01: "Artists as an entity, with biography and the one-line 'why they matter' —
AI-drafted, carrying a verified flag that only a human sets"), the six principles, and M2-04 (merged 17 Nov: the list,
the drafting desk, the owner-only `drafts` table). Format: Feature Spec Kit v1.1. Branch `m2-01-artists`._

## JOB
Every artist in the collection gains a biography and a short "why they matter" that make you look again at the work:
drafted under the list, approved by Michael and nobody else, and seen beside their works by everyone he invites.

## THE THREE VOICES
Every text in The Curator says whose it is, and the AI never speaks in its own interpretive voice.
1. **The artist's own words**: quoted exactly, attributed.
2. **The published record**: what the desk drafts from sources a person can check, and Michael approves. This is M2-01.
3. **The collector's reading**: Michael's own, dictated and signed. This is M2-02, and it sits beside the record, never
   inside it. His notes of 18 Nov on Halter, Yiadom-Boakye and Adams are its first entries (`context/collector/`).

## THE EXPERIENCE
Michael opens **Drafts** on his phone: an address only the owner can open, reached from a quiet word at the very end
of the wall that only he sees. One artist at a time: why they matter, then the biography. Each sentence carries its
small number; a tap shows the passage it rests on and the page it came from. Under it, folded away, what the desk
removed and why. Three choices: **Approve**, **Not this, with a note** ("too much about the films; say more about the
prints"), or **Later**. Approving takes a second; his name and the time go with it.

On the wall nothing changes: the wall stays free of words. On a single work, the tombstone arrives on intent as it
does today, and beneath it, quieter, the artist's "why they matter". "About the artist" opens the biography: who and
where, how they work, what they return to, where they sit. The artist's own words stand in it as quotations, and under
it is a short "Sources" line in the manner of a catalogue's *Literature*: the gallery, the museum, the artist's own
words, each a link. Every work by that artist carries the same text. An artist with no approved text looks exactly as
the work does today: no gap, no placeholder.

Catherina sees approved texts and their sources. She never sees a draft, a removal or a note.

A note on a rejection goes back to the desk: the next draft for that artist is written with it, still under the list.
An approved text is never replaced on its own; a newer draft waits beside it until Michael approves it.

## GOOD LOOKS LIKE
- Read in front of the work, each approved text passes three tests: **true** (every sentence checks against a source
  you can open), **useful** (it tells you how the artist works and what they return to, so you see something you
  hadn't), and **clear whose voice it is**.
- Michael approves five artists on his phone in under ten minutes, without instructions.
- An approved text appears on every work by that artist the next time the page is opened.
- Every sentence on screen keeps its source; the Sources line names and links them all.
- Nothing is approved without a person and a date, and only the owner can approve: the database refuses anyone
  else, and anyone half-signed-in.
- A viewer reads approved texts and nothing else from the drafts: proved by a test against the database, not only
  by the screen.
- A rejection with a note produces a next draft that answers the note, and the note appears in the report.
- Nothing about value, location, ownership or Michael appears in any text or in the page source.

## OUT OF SCOPE
Drafts about works, and the collector's reading on screen (M2-02). Free editing of a text. An artist page or a "by
artist" view. The "ask for a draft" button in the app (drafting stays a Workshop command). Approval by Jean or anyone
but the owner. Translation.

## TASTE ANCHORS
A good museum's audio guide: warm, exact, about what you are looking at. The Phaidon monograph's biographical note. The
*Literature* line in an auction catalogue, for how sources are shown: short, exact, never louder than the text.

## OPEN TRADE-OFFS — decided in the plan below
1. Editing. 2. Approval per field or per artist. 3. Sources shown to viewers. 4. Where the texts appear.
5. How Drafts is reached.

## PLAN — proposed 17 Nov 2026, revised 18 Nov, for Michael's 70%

**Before the build (in order).** (a) **M2-04b** merged: the review's fixes and the richer brief (150 to 250 words in
four moves; why they matter up to two sentences; the three voices; better sources first). (b) Your "Yes, apply it"
for the `drafts` table, once (a) has fixed the approval check. (c) The register's names put right (Hohanna Naude).
(d) The desk drafts all 33 artists into the table under the new brief: a few dollars from the Max credit. Then you
have real texts to approve on the day the screen arrives. Artists you know personally can be asked for their own
words, as Dan was; each one supplied makes that artist's text richer.

**What gets built: one PR, about two days.**
- **Drafts**, owner-only, phone-first: one artist at a time, sources on tap, the removals folded away; Approve /
  Not this, with a note / Later. Approval and rejection go through one database function that checks the owner and
  both factors, stamps the person and the time, copies the approved text into the artist's `biography` or
  `why_they_matter`, and sets `verified_at` / `verified_by` (the fields waiting since M1-01). It keeps the link to
  the draft, so the text's sources travel with it.
- **On the single work**: why they matter beneath the tombstone, on intent; "About the artist" opens the biography and
  its Sources line. Approved texts only, read through the viewer's own session, so the database decides.
- **The desk reads the note**: `npm run draft` passes the latest rejection note for an artist into the next draft,
  under the list, and records it on the draft. `--all` drafts every artist without an approved text.
- Tests: the owner approves and rejects; a viewer, an advisor, a stranger and a half-signed-in owner can do neither
  and read no draft; an approved text shows on every work by the artist; an artist without one renders as today;
  the note reaches the next draft (stand-in model, no key).

**The five trade-offs.**
1. **Editing.** Proposed: **no free editing in M2-01; approve, or reject with a note and the desk redrafts.** An
   edited sentence would bypass the checker and could lose its source, and anything you want to say in your own words
   belongs to your voice, M2-02, signed as yours. *Alternative:* light edits, re-run through the rule checker on save
   and marked "edited by Michael"; about half a day more.
2. **Per field or per artist.** Proposed: **per field.** The biography and why they matter are approved separately, so
   a good "why they matter" isn't held back by a biography that needs another pass.
3. **Sources for viewers.** Proposed: **yes, a short Sources line** under the biography for everyone who can read
   it. It is what makes the text trustworthy, and it costs nothing private: every source is already public, or the
   artist's own words.
4. **Where the texts appear.** Proposed: **the single work only, on intent.** The wall stays free of words
   (principle 1 and the M1-03 look). An artist page waits for M3's sequences, if it is wanted at all.
5. **How Drafts is reached.** Proposed: **a quiet "Drafts · n" at the very end of the wall, for the owner only**,
   plus the address itself. No menu, no chrome.

**Needs from you.** Your 70% on the five; "Yes, apply it" for the `drafts` table after M2-04b; the right spelling of
Naude.

**Approved — 18 Nov 2026, 15:40.** Michael, on the five: (1) "With you on No": no free editing; approve, or reject
with a note. (2) "Separately": the biography and why they matter approved on their own. (3) "Yes. It's possible that
sources may be outdated, so showing the source is important to show it's not just made up": the Sources line for
every reader, and **each source shown with the date the desk read it** ("read 18 Nov 2026"), so a reader can judge
for themselves whether a page may since have changed. (4) As proposed: the single work only, on intent. (5) As
proposed: a quiet "Drafts · n" at the end of the wall, for the owner only, plus the address. Builds after M2-04b and
SEC-02, once the `drafts` table is applied and all 33 artists are drafted under the new brief.

## BUILT — 19 Nov 2026, on `m2-01-artists`

_For Michael, who reads this before the preview. The plan above was built as approved, with the three
follow-ups the pre-flight check of 19 Nov left for the desk. What is in the register's code now, in
plain words; the engineering is in the files named._

**The one door: `decide_draft`.** Approving or sending back a draft goes through one database function
(`supabase/migrations/20261119120000_approvals.sql`). It checks that the person is the collection's
owner with both factors, using the same check row-level security uses; refuses anyone else, and the
owner half-signed-in, with the one sentence "only the collection's owner, signed in with both
factors, may decide a draft", and says nothing of whether the draft exists; refuses a draft decided
already; and refuses a rejection without a note. On approval it stamps your name and the time on the
draft, copies the text onto the artist (`biography` or `why_they_matter`), sets `verified_at` and
`verified_by`, and keeps the link to the draft (`biography_draft_id`, `why_they_matter_draft_id`) so
the text's sources travel with it. The biography and why they matter are decided separately
(trade-off 2). The browser can do nothing else to a draft or an artist: no signed-in session may
write either table by hand, as before. Every write lands in the audit log with you as its actor.

**What everyone you invite reads.** A view, `approved_texts`: an approved text, its sentences and its
sources — and only the text the artist carries now (an older approval, since replaced, leaves the
view). Not what the desk removed, not a note, not a draft that still waits: the view has no column for
them, and the drafts table itself shows a viewer nothing. _Corrected 19 Nov, second round:_ of the
draft's sources — the desk stores one shared list on both fields' drafts — the view returns only the
passages the text's own sentences cite, so a passage the other field's draft cites, which may still be
waiting or have been sent back, reaches no member even through the database. The database test proves
it for Catherina, for an advisor, for a stranger, for the owner of another collection and for you
half-signed-in.

**On the single work.** Beneath the tombstone, quieter, the artist's approved "why they matter"; under
it the quiet word "About the artist", which opens the biography — who and where, how they work, what
they return to, where they sit — with the artist's own words standing in it as quotations. Each
sentence carries its small numbers; under the biography a short Sources line in the manner of a
catalogue's *Literature*: each page named once, linked, and dated with the day the desk read it —
"read 19 Nov 2026" — as you asked (trade-off 3). The two texts are separate drafts numbering their own
passages; on the work they share one Sources line, one entry per page however many passages were quoted
from it, numbered as first cited (_corrected 19 Nov, second round:_ the first build listed every passage,
so one gallery page appeared three times). The artist's supplied text is named by its own heading —
"Dan Halter — in his own words" — never by the desk's "(the artist)" marker. An artist with no approved
text looks exactly as today: no gap, no placeholder — and "Not enough is known yet." is never shown as
a text. The wall
stays free of words (trade-off 4). A note on the tombstone: today it is a fixed caption, not on
intent; the texts sit beneath it the same way.

**Drafts, on your phone.** At the very end of the wall, for you alone, a quiet "Drafts · n" — n is the
artists with a draft waiting; for anyone else the drafts table is empty and there is no word
(trade-off 5). Its address is `/drafts`: it finds the first artist waiting, in the register's order,
and goes to `/drafts/<artist>`. For anyone but the owner the address is not there — the same page as
any wrong address. One artist at a time: why they matter, then the biography — in each field the
newest draft, where it still waits. Each sentence carries its small numbers; a tap shows the passages
it rests on and the pages they came from, with the day they were read. Under the text, folded away,
what the desk removed and why, and what the second reading doubted but kept. Three choices for each
text: **Approve**; **Not this, with a note** (the note is required: say what the next draft should do
differently); **Later** (the next artist). Approving takes a second; the text is on every work by
that artist the next time a page is opened. No free editing (trade-off 1): an edited sentence would
lose its source; your own words belong to your voice, M2-02. A field that is only the list's own
sentence, "Not enough is known yet.", is not offered for approval — send it back with a note, or
leave it — and the database refuses to approve it in any case: approved, it would sit under every
work by that artist as a placeholder (_19 Nov, second round_). If the database refuses — it will
not, for you, with both factors — the page says so in one of a few known sentences of its own,
chosen by a short code in the address; a link someone else writes can put no words of theirs there.

**The desk reads your note.** `npm run draft` finds, for each artist and field, the newest decided
draft; where you sent it back with a note, the next draft is written to answer it — still only from
the sources, still under the list — the model sees the note inside `<note>` delimiters as a request
about emphasis and matter, and the new draft records which draft it answers (`answers`). The report
prints the note above the draft; the Drafts screen shows "Written to answer your note: …". `--all`
drafts every artist unless the newest draft of each of their two texts is approved — so an artist whose
"why they matter" you approved and whose biography you sent back is drafted again, both fields, and the
note is answered (_corrected 19 Nov, second round:_ the first build skipped any artist with one approved
text, which would have left such a biography to `--artist` alone). Run after the migration is applied,
the command needs the new columns.

**The three follow-ups from the pre-flight check, built into the desk.**
1. A quotation given to the artist where the passage shows no one speaking is removed (rule 7),
   whichever page is named — the code cannot follow "Doe argues" back to a name it knows, so it fails
   safe. Before, the page's name carried it. The artist's own supplied text, and the artist shown
   speaking in the passage, pass as before.
2. A narrow code check for where a living artist lives or works, closer than a city and a country
   (rule 8): a street address — a number that is not a year, then capitalised words, then Road, Street,
   Avenue, Lane, Drive and their kin — and the studio's whereabouts — "studio is in", "her studio in",
   "a studio at", followed by a capitalised place. "The Bag Factory studios in Johannesburg" is neither;
   a city and a country pass; "2012 Trafalgar Square" is a year, not a house number (_19 Nov, second
   round_). Narrow by design, and you should know what it does not reach: "45 main road", "a studio on
   Bree Street", "Her Woodstock studio", "Her studio, in Woodstock" and "12 Rue de Rivoli" pass the code
   and are the brief's and the second reading's, which name a neighbourhood too. A dead artist's former
   address is left to them as well, as rule 8 is for the living.
3. What the model cut when it shortened a long biography is kept beside the draft as one entry,
   "shortened": the longer version whole, as it stood before, with the word counts. It shows in the
   report under "Removed by the desk" and on the Drafts screen under what the desk removed — and only
   where the model changed anything; the same text back is no shortening (_19 Nov, second round_).

Also: every source the desk reads now carries the date it read it (`readAt`), which the Sources line
shows; a source written before today takes its draft's date.

**Tests — 280 pass; 15 run only in CI (the database).** New: the one door refuses a viewer, an advisor,
a stranger, the half-signed-in owner and the anonymous role, and a nonexistent draft, all with the one
sentence; a rejection without a note is refused; you approve a biography and the draft, the artist,
the link and the audit log all say so; an older draft of the same field still waits; a decided draft
is not decided twice; you send back why they matter and the note is kept, nothing landing on the
artist; a next draft records what it answers; Catherina, an advisor and you read the one approved
text through `approved_texts`, a stranger and anyone half-signed-in read none, the anonymous role is
refused, and the view has exactly nine columns; a newer approval replaces the text and the view
follows; no signed-in session writes an artist's text or stamp by hand; a re-run of the ingest leaves
the approved text where it is. In plain code: which draft of a field counts, what waits and in what
order, the note the desk answers; the approved texts' shape held (a link a browser may follow is
http(s) only), the sources combined and dated, the title in italics; the attribution fail-safe, the
address and studio checks with their near-misses, the "shortened" entry in the desk and the report,
the note in the prompt and the note recorded. Workshop has no Postgres, so for this build the whole
database test file was run here against PGlite (a Postgres 17.5 compiled to WebAssembly, behind its
wire-protocol socket) — all 15 pass, the new migration applied as CI applies it; CI runs them again
on Postgres 16 when the pull request is opened (CI runs on pull requests and on `main`, not on a
branch push).

**Order of going live.** The migration is additive — new columns, one function, one view; nothing on
`main` today reads them — so it is safe to apply before the merge, and the preview can then be judged
with real drafts: `supabase db push` listing exactly `20261119120000_approvals.sql`, on your "Yes,
apply it". Then open `/drafts` on your phone. Until it is applied, the single work and the wall read
as today, and `/drafts` is not there. Three things to know first (_the review of PR #14_):
1. **The preview reads the live register.** Every Approve or Not this you tap while judging the preview
   is real and final in the live database, and nothing on any screen undoes it. Approve only what you
   are sure of; use Later for the rest.
2. **Supabase's Security Advisor will show a red "Security Definer View" error on `approved_texts`.**
   That is this view, built that way on purpose: it runs with the owner's rights so that it can read
   the drafts table, which a viewer cannot, and it checks membership and both factors itself. The
   review tested it as every role; the database test does too. The warning is to be read, not acted on.
3. **Once applied, this migration file is fixed.** Any later change to it — the view, the function —
   has to go in a new migration; `db push` never re-runs a file. The second round's change to the view
   (the cited passages only) was made in this file because it had not yet been applied.

**Not done, and said so.** No component tests in a browser-like environment (vitest runs in node; the
screens are proved through the database and the pure code, and judged on the preview). The tombstone
on the single work is a fixed caption today, not "on intent" as the spec assumed; the texts follow it.
The pre-flight check's follow-ups 4 to 7 (`added_info` on the provenance line; the composite foreign
keys; the Postgres 17 "maintain" privilege; members seeing each other) are not in this branch. From the
review of PR #14, not done by your list: `myRole()` takes the first membership it finds, which is right
while there is one collection (M3 passes the collection); and the small numbers under "why they matter"
jump to the Sources line inside the closed "About the artist" drawer, which some phone browsers may not
open on a jump — judge it on the preview.

## BUILT — 19 Nov 2026, second round: the cold review of PR #14

_No blockers. Six should-fixes, the nits you named, and the missing test — all on the branch, the
migration file changed in place since it is not yet applied._

- **Should-fix 1, the placeholder.** "Not enough is known yet." can no longer be approved: the Drafts
  screen offers no Approve for a field that is only that sentence, the function refuses it with its own
  sentence, and the single work never shows it even if a row carried it. Tested in the database.
- **Should-fix 2, the Sources line.** One entry per page, however many passages were quoted from it; a
  supplied text is one entry, named by its own heading. The superscripts are renumbered to match, a
  sentence resting on two passages of one page carrying one number. Tested in plain code with three
  passages of one Stevenson page and three of one supplied text.
- **Should-fix 3, the view.** `approved_texts` returns only the passages the text's own sentences cite,
  in the migration file itself. Tested: the viewer reads one of the two seeded sources; the owner's
  table keeps both.
- **Should-fix 4, `--all`.** Every artist unless the newest draft of each field is approved; the
  statuses never reach the model. Tested in plain code, the review's case included.
- **Should-fix 5, the note.** The three facts above, under "Order of going live".
- **Should-fix 6, the anonymous role.** The test harness now lets the API roles use the schema and
  execute functions by default, as Supabase does, so the refusals read "permission denied for function
  decide_draft" and "for view approved_texts": the grants themselves, proved.
- **The nits.** A note of tabs and newlines is refused and a stored note is trimmed of all whitespace;
  the studio check asks for a capitalised place, as its comment says, and "the studio is in her house"
  is left to the second reading; a year before Square or Place is not a house number, and what the
  address check does not reach is written down above; no "shortened" entry when the model gave the same
  text back; the owner's screen follows a source link only when it is http(s), as readers' do; the status
  line shows one of five known sentences chosen by a short code, never the text of the address; the
  desk's "(the artist)" marker is never shown, a supplied text reading as the artist's own words.
- **The missing test.** USER_B now owns a second collection with an artist and a draft: refused on this
  collection's draft, half-signed-in or not; this owner refused on theirs; each owner reads their own
  approved text alone through the view, and nothing of the other's drafts.
- Tests: 284 pass here without a database; the 15 database tests ran again against PGlite with the changed migration, all passing — 299 in all.
