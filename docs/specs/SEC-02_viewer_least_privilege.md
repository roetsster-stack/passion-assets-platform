# SEC-02 — The viewer sees the works, not the register

_Spec drafted 17 Nov 2026 from CLAUDE.md's security requirement ("location and ownership are sensitive field
classes"), principle 4 (private by default; visibility is architectural, RLS, not a preferences pane), and the open
item since 10 Nov: make the viewer role least-privilege in the database before anyone outside the family is invited.
Must merge before Brett's invitation on 30 Nov. Format: Feature Spec Kit v1.1. Branch `sec-02-viewer-role`._

## JOB
Anyone Michael invites to look at the collection can see the works and what is said about them, and nothing the
register knows about money, place, ownership or private notes: enforced by the database, not by the screens.

## THE EXPERIENCE
Nothing visible changes. Catherina, Brett on 30 November, or anyone else invited as a viewer sees the wall, the
works, the glass, the tombstone, how a work came ("Acquired from Stevenson, March 2016"), its provenance as entered,
and, from M2-01, the approved texts. Michael, as owner, sees exactly what he sees today.

What changes is underneath. Today the screens show no value, price, location or owner, but the database would still
hand them to any signed-in viewer who asked it directly, with their own session. After SEC-02 it refuses: the
purchase price, the current value and its date and source, the location and its tags, the condition, the admin and
raw notes, the Airtable record as imported (which carries all of these), the owners and who owns what, and the
documents (invoices, certificates) are readable by the owner alone, and only with both factors.

## GOOD LOOKS LIKE
- A test signs in as a viewer and asks the database directly, through the same interface the browser uses, for
  every sensitive field, every owner, every document: it gets none. The owner gets all of them.
- The wall, the single work, the glass and sign-in behave identically for owner and viewer.
- An advisor is treated as a viewer until the advisor door (Door 3) is specced.
- Nothing is copied or deleted in a way the ingest can't repeat: a second ingest run changes nothing, and the audit
  log records every write as before.
- New sensitive fields from M2-02 and M2-03 (location, condition, valuation) land on the owner-only side by default.

## OUT OF SCOPE
Any new screen. The advisor door's own permissions. Per-work sharing. Hiding provenance lines (some carry prices in
their free text: that is M2-03's structured provenance, with Jean's field list).

## TASTE ANCHOR
A museum's public catalogue and its registrar's files: the same works, two doors, and the second one locked.

## OPEN TRADE-OFFS — decided in the plan below
1. How the database hides the fields. 2. What an advisor sees. 3. The documents.

## PLAN — proposed 17 Nov 2026, for Michael's 70%

**What gets built: one PR, about a day.** A migration that moves the sensitive fields of each work into an
owner-only companion table, one row per work, with its own row-level security (owner and both factors), the audit
trigger and the same import key; the owners and who-owns-what tables, and the documents, owner-only. The ingest
writes both halves of a work in one transaction. The screens read only the visible half, through the viewer's own
session, as now. Tests in CI against a real Postgres: viewer, advisor, stranger, half-signed-in owner and owner,
field by field.

**The three trade-offs.**
1. **How the fields are hidden.** Proposed: **a separate owner-only table** for the sensitive fields. Postgres
   security works by rows, so a table the viewer can't read at all is the simplest thing to prove and the hardest to
   undo by accident. *Alternative:* column permissions and a special view for the owner. Less moving of data, but
   easier for a later change to open by mistake.
2. **The advisor.** Proposed: **a viewer until Door 3.** Brett is invited on 30 Nov to see the demo. What a
   professional needs (location, condition, documents) is decided when his door is specced, with his terms.
3. **The documents.** Proposed: **owner-only.** Invoices carry prices. A certificate of authenticity could be shown to
   viewers later, by kind, if wanted.

**Needs from you.** Your yes, and your 70% on the three. It builds on Workshop in about a day, and merges before 30 Nov.

**Approved — 18 Nov 2026, 15:40.** Michael: yes, and all three as proposed. (1) The sensitive fields move to a
separate owner-only table. (2) An advisor is treated as a viewer until the advisor door is specced; Brett on 30 Nov
sees what any viewer sees. (3) Documents, invoices and certificates alike, owner-only. Builds on Workshop after
M2-04b; merges, and its migration is applied, before Brett's invitation on 30 Nov. The note says in which order the
migration is applied and the code goes live, so that no screen breaks between the two.

---

## BUILT — 18 Nov 2026, branch `sec-02-viewer-role`

_A note to Michael from the session that built it. The order of going live is the second heading; read it first if
you read one thing._

**What changed.** One migration, `supabase/migrations/20261118180000_viewer_least_privilege.sql`, not applied. It
creates `item_private` — one row per work, holding the purchase price and currency, the current value with its
currency, date and source and the date Airtable last set it (`airtable_modified_at`: Airtable's "Last Modified"
watches Current Value only, so it is the valuation's own date — moved in the second round, the review's blocker 1),
the location and its tags, the condition note, the admin, comments and notes fields, and the Airtable record as
imported — moves every work's values into it, and drops those fifteen columns from `items`. The move itself is in
the audit log as `migration:sec-02` (second round). The new table is readable by the collection's owner alone and
only with both factors (the same `is_collection_owner` the drafts table uses); the signed-in may not write it, the
anonymous role gets nothing, every write is audited. The
owners, who owns what, and the documents keep their rows and lose their readers: their policies now say owner too. An
advisor reads what a viewer reads, as you ruled; Brett on 30 November sees the wall, the works, the glass, the
tombstone, how a work came, and the provenance as entered. Nothing a screen reads moves: the wall and the single work
select the same columns of `items` as before, and `gallery_pictures` is untouched. The ingest writes both halves of a
work in its one transaction — the visible columns on `items`, the rest on `item_private`, found by the work's id and
rewritten whenever the work is; the content hash covers the whole record, so a second run still changes nothing — and
a work whose private row is missing is written again whatever its hash (second round, the review's nit 13).
`npm run ingest -- --report` counts the flagged works on the new table.

**The order of going live — the review's eight steps (PR #13), which replace the three of the first round.** The
first round's order was unsafe in one way the screens never show: M2-04b (PR #12) corrects the drafts migration in
place, and a `supabase db push` before it merges would record the old text as applied, for good — `db push` never
re-applies a version. The screens are safe in either order, as before: the wall and the single work read eleven
named columns of `items`, none of which moves, and no screen ever read a price, a value, a location or an owner.

1. **This branch is fixed** — the review's blockers 1 and 2, should-fixes 3 to 5, nits 8 to 10 and 13 — and the
   one-off check of the free-text columns a viewer can still read has been run on Workshop; its result, by field name
   only, is under "The second round" below. Done, 18 Nov.
2. **M2-04b (PR #12) merges first,** once its own review is settled. Nobody runs `supabase db push` before then.
3. **This branch is updated from main and CI goes green.** The update merges cleanly (the reviewer trial-merged it).
   Don't merge on a red or skipped database test: CI is the first real run of this feature's tests.
4. **Merge SEC-02.** Vercel deploys, and the screens look the same. Run no `npm run ingest` until step 6: before the
   migration the new ingest fails at its first query of the works (it joins `item_private`), inside the transaction,
   before anything is written — a failed run row and nothing else.
5. **Apply the migrations on Workshop.** Pull main and run `supabase db push`. Before confirming, check that it lists
   exactly two files: `20261117120000_drafts.sql` and `20261118180000_viewer_least_privilege.sql`. If it lists
   anything else, stop. Confirming is also your yes to the drafts table.
6. **Run the ingest once** — `npm run ingest`. Every work should come back unchanged. Then `npm run ingest -- --report`.
7. **Check the screens.** Sign in as yourself and as Catherina (a viewer): the wall and a single work should look
   exactly as before.
8. **Finish all of this before the invitation on 30 November.**

**The three trade-offs, as approved.** (1) A separate owner-only table, not column grants: Postgres secures rows, so
a table the viewer cannot read at all is the simplest thing to prove and the hardest to open by accident; the next
sensitive field (M2-02's location and condition, M2-03's valuation) is added to `item_private`, never to `items`, and
the test that lists the private columns is where it goes. (2) The advisor is a viewer until Door 3. (3) Documents,
invoices and certificates alike, owner-only.

**What stays on `items`, by the spec's list — say if any should move.** The status and the sold year (the wall hangs
the sold works under their hairline); how a work came (`acquired_on`, `acquired_from`, `credit_gallery`), which the
single work shows; `links`; the register flags (`has_high_res`, `has_low_res`, `has_invoice`, `has_coa`) and
`high_res_note`; the empty M2 narrative fields (`collectors_story`, `work_context`); the bookkeeping (`airtable_record_id`,
`content_hash`, `source_removed_at` — `airtable_modified_at` moved in the second round, see above). None is money,
place, ownership or a private note. Of these, the status, `acquired_on` and `acquired_from` reach a screen;
`sold_year` and `credit_gallery` reach none (_corrected in the second round: the first round said "only the first two
groups reach a screen"_). The second round's check (below) found no money, place or invoice name in `links`,
`high_res_note`, `credit_gallery` or `acquired_from`, so none of them moves.

**Tests** — in `tests/db/ingest.test.ts`, against a real Postgres, beside the others. The migration's move: just
before it runs, one work is written the old way with every one of the fifteen fields set, and a second with none of
them (second round); just after, every value is on `item_private`, the empty work has its empty row, both inserts are
in the audit log as `migration:sec-02`, and not one of the fifteen columns is on `items`. Then SEC-02's own test: the
wall's columns, the provenance and the pictures read identically for the owner, a viewer and an advisor;
`item_private`, `owners`, `item_owners`, `documents`, and (second round) `audit_log` and `ingest_runs` return rows to
the owner with both factors and none to the viewer, the advisor, a stranger, a half-signed-in owner, or the anonymous
role; the viewer asks for every sensitive field of a work it can see, by id, and for its owners and documents, and
gets nothing; every one of the fifteen columns is gone from `items` for anyone who asks, and the columns `items`
carries are exactly a list the test holds, so a new column fails CI until it is placed on purpose (second round); a
further ingest run changes nothing and both halves are audited as the ingest; a private row deleted by hand is back
after the next run, with the work counted as updated (second round). The stranger, half-signed-in and no-write checks
that run over every table include the new one. Lint, typecheck, the 202 unit tests and the build pass on Workshop.

**Not run on Workshop, said plainly.** The database tests — this feature's proof — did not run here: there is no
Postgres on this Mac, and the throwaway one I tried to fetch into the session's scratch folder was refused by the
session's safety rules. They run in CI against a real Postgres when the pull request is opened, with every migration
applied in order on a fresh schema. Until that is green, the migration has been read, not executed.

**Not done, and noticed.** `collection_members` is still readable by every member: a viewer can list who else is in
the collection, by user id and role — not in this spec; say if it should go owner-only with the rest. The audit log
keeps the old `items` rows with their values, as it should, and is owner-only already. The advisor door, per-work
sharing, and the free text of provenance lines (M2-03) stay out of scope. This branch and `m2-04b-checker` both edit
`src/lib/ingest/run.ts` and `tests/db/ingest.test.ts` in different places; whichever merges second should merge
cleanly, and if not the conflict is a few lines.

---

## The second round — 18 Nov 2026, after the cold review of PR #13 (`sec-02-viewer-role` @ 0f6c5f1)

_What the review asked for and you chose: blockers 1 and 2, should-fixes 3 to 5, nits 8 to 10 and 13, the one-off
check, and the eight steps. The migration is still not applied._

**The check — field names only, never values.** Run once on Workshop as the database owner, read-only, over every
work and every provenance line, looking for an amount (a currency symbol or code before a figure, a grouped number, a
currency word, a price or valuation word), an invoice name (invoice, receipt, a numbered invoice, a `.pdf`, a
pro-forma) and a place (a room or storage word, or any of the register's own location names and tags, compared and
never printed). On works: `links`, `high_res_note` and `acquired_from` carry none of these; `credit_gallery` is empty
in every row. So nothing more moves off `items`. On provenance: `airtable_raw` carries amounts (a currency symbol
before a figure, in ten of its strings) and invoice names (four attachment filenames); `reviews` carries attachment
filenames (`.pdf`, two lines) and no amount or invoice word; `details_url` holds web addresses only (one path has a
room word in it); `added_info` is empty. The spec puts provenance text out of scope and you asked for the `items`
move only, so those two provenance columns are not moved here: a viewer who queries the database directly, on
purpose, can read them. Say if `provenance_events.airtable_raw` and `reviews` should go owner-only with the rest —
the same companion-table move, a small follow-up.

**Blocker 1 — the valuation's date.** `airtable_modified_at` is the date the current value was last set, and a viewer
could read it. It is now the sixteenth column of `item_private` — in the table, the copy and the drops of the
migration, in the ingest's `PRIVATE_COLUMNS` instead of `ITEM_COLUMNS`, and in the test's `PRIVATE` list. Nothing
read it but the ingest's own writes.

**Blocker 2 — the order.** The eight steps above, in place of the three. The one thing that was wrong: a push before
PR #12 merges would have fixed the drafts migration on its first text, for good.

**Should-fix 3 — the move audited.** The migration now creates the triggers, turns on row-level security and sets
the policy and the grants directly after `create table`, before the copy, so every private row's first audit entry
reads `migration:sec-02` and the table is never open, not even for the length of the migration. The test counts the
two seeded works' inserts under that actor.

**Should-fix 4 — new columns land on the owner-only side.** The test holds the full list of what `items` may carry
(thirty-one columns) and compares it with the database's own list: a column added to `items` fails CI until someone
places it on purpose. **Should-fix 5:** `audit_log` and `ingest_runs` are in the owner-only loop — rows for the owner
with both factors, none for the viewer, the advisor, the stranger, the half-signed-in owner, and permission denied to
the anonymous role.

**The nits.** *8:* the note's "would fail at once" is now true for a different reason — the ingest's first query of
the works joins `item_private`, so before the migration it fails there, inside the transaction, before any write.
*9:* corrected above: `sold_year` and `credit_gallery` reach no screen. *10:* the migration test seeds all fifteen
fields on one work and nothing private on another, and reads both back. *13:* a work whose private row is missing is
written again on the next run, whatever its hash; the test deletes one and runs the ingest.

**Not done, by your list.** Nit 11 (a composite foreign key tying `item_private.collection_id` to its work's
collection), nit 12 (a viewer can tell that something private changed, never what), nit 14 (members can see each
other, by user id and role), and the provenance move above. Lint, typecheck and the 202 unit tests pass on Workshop;
the database tests, as before, run in CI on the pull request.
