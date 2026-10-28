# CLAUDE.md — read before any work in this repository

This is **The Curator** (working title): a platform where a serious collector lives with their
collection. One shared record of truth, three doors (collector, family office, advisor). V1 is the
**Collector's Experience layer on the founder's own art collection**, migrated out of Airtable.

The founder (Michael) orchestrates; agents build; a different model family (Codex) checks. He never
edits code. He reads the PR note, not the diff. Build sessions normally run on his always-on Mac
("Workshop"); the system of record for specs, decisions and the log is his project folder, not this repo.

## The six principles — everything here is downstream of these

1. **Enjoyment is the front door.** Valuation and market data live behind it, never in front.
2. **The hold is the product.** Build for the ~27 years between acquisition and disposal.
3. **One record, three doors.** Never fork the record per audience; the doors are views and permissions.
4. **Private by default, opt-in always, declining costs nothing.** Visibility is architectural (RLS), not a preferences pane.
5. **Build cost stays near zero** — the cost of *changing* it. Boring, hosted, standard. Nothing that needs a human to configure per customer.
6. **The system curates; it does not merely record.** A feature that only improves the completeness of the record is not a V1 feature.

Rulings that bind the code: **no marketplace, no exchange, no sharing surface, no social.** Galleries are a
data source, never a customer. **Art only in V1** — a `category` field keeps the seam; no wine, watches, cars
or books fields. Sold works stay in the register (a status, never a deletion).

## Security of the register — an architectural requirement, not a sprint

A database that knows where valuable works are is a target. Therefore: nothing renders without sign-in;
MFA; row-level security on every table from the first migration; no public routes; image masters never
served (signed, short-lived URLs for renditions only); location and ownership are sensitive field classes;
an audit log on every write. **Secrets never enter the repository or a chat** — `.env*` is ignored; real
values live in Vercel and in `~/curator/.env` on Workshop.

## The loop — one feature at a time

Spec (one page, in `docs/specs/`, from the founder) → Plan (propose approach + trade-offs; he approves
at 70%) → Build (branch; code + tests + a short PR note) → Check (Codex review) → Verify (CI green;
he judges on the Vercel preview) → Merge → Log. One to two features a week.

Conventions:
- Branch per feature: `m1-01-schema-ingest`, `m1-03-gallery` … PR title = spec id + outcome.
- Tests alongside the feature (`vitest`). CI runs lint, typecheck, test, build.
- Database changes are migrations in `supabase/migrations/`, never dashboard edits.
- Write the PR note for a non-engineer: what changed, why, how to verify on the preview.
- Do not add dependencies casually. Prefer what Next.js, Supabase and the platform already give.
- Vocabulary from the Feature Spec Kit (tombstone, full-bleed, chrome, hero, archival capture,
  degrade gracefully, gallery dark, single-work flow vs grid) — use it in code and copy.

## Stack (approved 28 Oct 2026)

Next.js (App Router, TypeScript, Tailwind v4) · Postgres on Supabase (auth, RLS) in London ·
Cloudflare R2 for image masters, rendition ladder (480/1080/2160/4320, AVIF + JPEG) and DZI tiles,
OpenSeadragon for zoom · Anthropic API server-side for the product's AI features (from M2) ·
Vercel with a preview per PR, functions pinned to `lhr1`.

## Commands

`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
