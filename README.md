# passion-assets-platform

**The Curator** (working title) — software that lets a serious collector live with their collection.
One shared record of truth, exposed through three doors: the collector, the family office, the advisor.

V1 is the Collector's Experience layer, built on the founder's own collection. Private, invite-only,
no public surface.

## How this is built

Founder as orchestrator; Claude Code as builder; Codex as independent checker. One feature at a time:
**spec → plan → build → check → verify → merge → log.** The founder writes one-page specs
(`docs/specs/`), approves plans at 70% information, and judges every feature on its preview link.
He never edits code. See `CLAUDE.md` for the rules every build session inherits.

## Stack

Next.js · Postgres on Supabase (London) · Cloudflare R2 for images · Vercel (preview per PR, `lhr1`).

## Running locally

```
cp .env.example .env.local   # fill from the dashboards; never commit
npm install
npm run dev
```

`npm run lint` · `npm run typecheck` · `npm test` · `npm run build` — the same four CI runs.

## Layout

```
src/app/            routes and surfaces (App Router): / (the wall), /sign-in, /auth/confirm, /mfa, /sign-out
src/middleware.ts   the door: nothing renders without sign-in and the second factor
src/lib/auth/       the door's decision, as a pure function
src/lib/ingest/     the Airtable ingest (npm run ingest); src/lib/supabase/ the server and browser clients (RLS applies to both)
scripts/            ingest.ts and invite.ts — run on Workshop with ~/curator/.env
supabase/migrations one SQL file per change; the schema is never edited in the dashboard
docs/specs/         one page per feature, committed with the feature
tests/              vitest
```

## Slices

- **M1 — Render smartly:** schema + Airtable ingest, image pipeline, the gallery, sign-in and security.
- **M2 — Context, intelligently:** artists, stories, structured provenance, the twelve golden records.
- **M3 — Draw the viewer in:** ambient mode and the show on the big screen.

Private and confidential.
