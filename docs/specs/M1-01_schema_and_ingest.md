# M1-01 — The record arrives: core schema and the Airtable ingest

_Spec drafted 28 Oct 2026 for the founder's approval at 70%. Format: Feature Spec Kit v1.1._

## JOB
Michael's collection — every work, its provenance, its documents and its images — lands in the
platform's own record of truth, from Airtable, and can be brought across again at any time without
anything being lost or duplicated.

## THE EXPERIENCE
I run one command on Workshop. A minute later every work I keep in Airtable is in the platform:
the artist, the title, the year, the medium, the dimensions, what I paid and when, where it is and
what state it is in, who owns it, the line of provenance, the invoice and the certificate, and the
photograph I have today. The ingest prints its report — works, artists, provenance lines, pictures,
documents, and how many records it flagged for my eye — and the empty state is ready to show the
count the moment sign-in exists (M1-04). Tomorrow Brett corrects a record in Airtable; I run
the same command and only that record changes. Nothing I entered in Airtable is thrown away, even
the fields we have not yet decided how to use — they travel with the work until we do.

## GOOD LOOKS LIKE
- Every Airtable record is a work in Postgres, linked to its artist, its provenance events, its
  documents and its images; the counts in the ingest report match the base exactly, sold works included.
- Running the ingest twice in a row changes nothing; a single edit in Airtable changes exactly one row.
- The audit log shows the import: who ran it, when, what was created, updated, unchanged.
- Nothing is readable without being a signed-in member of the collection — proved by a test that
  queries as an anonymous user and as a stranger and gets nothing.
- The platform no longer depends on Airtable's expiring attachment links: the pictures and
  documents are copied into our own private storage at ingest.

## OUT OF SCOPE
- No gallery, no rendering of any kind (M1-03). The count on the empty state is the only visible change.
- No full-resolution masters, renditions or tiles (M1-02). Today's Airtable "Low-Res Image" is copied as-is.
- No AI drafting, no artist biographies (M2). Artists exist as an entity with name and nationality only.
- No structuring of provenance into typed events (M2-03). The line travels as the line.
- No valuation surface. Value fields are stored and never shown.
- No wine, watches, cars, books fields. `category` on every item keeps the seam.
- No edits in the platform. Airtable stays the working register until M2 lands.

## TASTE ANCHOR
A catalogue raisonné's data discipline — every field first-class, dated and sourced — with none of
its presentation. Steal the rigour; leave the typesetting for M1-03.

## OPEN TRADE-OFFS — decided in the plan below, approved at 70%
1. Artists as an entity now, derived from Surname + Name in the ingest, or deferred to M2?
2. Copy the low-res pictures into our storage in this feature, or wait for the image pipeline?
3. Airtable's `Location` mixes places, states and condition notes — map by rule now, or carry as-is?
4. Keep the raw Airtable record on every work, so a mis-mapped field can be re-mapped without re-reading?

---

## PLAN — proposed 28 Oct 2026 (builder); approve, amend or kill

**Shape.** One Supabase migration (`0001_core.sql`) and one script (`npm run ingest`), run on
Workshop with the service-role key from `~/curator/.env`. Not a web route: there are no public
routes, and an import is a job, not a page.

**Tables.** `collections` · `collection_members` (user → collection → role: owner / advisor /
viewer — the RLS basis and the seam for three doors) · `owners` (person / joint / company / trust /
vehicle — the ownership graph; seeded with Michael, Catherina, Joint, Terracura) · `item_owners`
(item → owner, share, from, to) · `artists` · `items` (the core record, `category = 'art'`;
acquisition, prices with currency and date, valuation with date and source — nullable, status,
location, condition, the three narrative fields — nullable until M2, visibility `private` by
default, `airtable_record_id` unique, `airtable_raw` jsonb) · `provenance_events` (free-text label,
links, notes now; type / date / party columns present and null until M2-03) · `images` (item, kind
`lowres_airtable` now; `master` / rendition kinds in M1-02; storage key, dimensions, bytes, hash) ·
`documents` (invoice / coa / other; private storage key) · `ingest_runs` · `audit_log`.

**Security from the first migration.** RLS on every table; the one policy pattern: the row's
collection has the caller as a member. Service role only for the ingest. Storage buckets private;
no URL in the database is ever a public one. `location` and `item_owners` are the sensitive
classes — same RLS in V1, kept in their own columns/tables so M1-04 can tighten them without a
schema change. Triggers write `audit_log` on insert / update / delete for every table.

**The ingest.** Reads the base through the Airtable REST API (read-only token, scoped to this
base). Upserts on `airtable_record_id`; computes a content hash so unchanged rows are skipped and
counted as unchanged. Artists deduplicated on normalised Surname + Name. `Year` stored as the
original text plus a parsed integer (the base has "2o24", "undated" — the hygiene hour fixes the
source; the ingest tolerates it). `Location` mapped by rule: `SOLD <year>` → status *Sold* + year;
`On Loan <place>` → status *On loan* + location; `at framer` → status *At framer*; a place → location;
anything else → admin notes, flagged. Attachments (low-res images, invoices, COAs, added info)
downloaded and written to the private R2 buckets under `collection/<id>/…`, hashed, skipped if
already present. Every run writes an `ingest_runs` row with the counts.

**Tests.** A synthetic Airtable fixture (no real records — location and ownership are sensitive)
drives: mapping of every field, the location rule, artist dedupe, idempotency (second run =
zero changes), and RLS (anon and stranger read nothing). CI runs them; the real run is on Workshop.

**Needs from Michael before the real run (never in chat):** Supabase project reachable (migrations
pushed with the CLI from Workshop); an Airtable personal access token, read-only, scoped to the
collection base; an R2 API token for the two private buckets. All into `~/curator/.env`.

**Recommendations on the four trade-offs:** 1 — now (it is two hours, it fixes the per-work
nationality error class permanently, and M2 inherits it). 2 — now (the first look needs pictures,
and Airtable's links expire). 3 — by rule, with the unmapped remainder flagged, not lost. 4 — yes.

---

## BUILT — 28 Oct 2026 (PR #1, branch `m1-01-schema-ingest`)

All four trade-offs taken as recommended. What shipped: one migration (`supabase/migrations/20261028140000_core.sql`),
the ingest (`src/lib/ingest/*`, `npm run ingest`), the empty state reading its count through row-level
security, and the tests — the mapping against a synthetic fixture, and the ingest and the security
policies against a real Postgres in CI (first run creates everything; second run changes nothing; one
edit changes one row; a stranger and the anonymous role read nothing; a member cannot write).

**Verify on Workshop:** `npm run ingest -- --skip-attachments` (records only, under a minute), read the
report; then `npm run ingest` for the pictures and documents; then `npm run ingest -- --report`. Run it
twice: the second report shows `unchanged` everywhere and `created 0`.

**Next, proposed:** M1-04 sign-in before M1-03, so the first look is behind a door — then the gallery on
the low-res pictures already copied, and M1-02 (masters, renditions, tiles) after the first look.

