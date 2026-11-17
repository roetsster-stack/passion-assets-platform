-- M2-04 · The drafting desk: drafts, written under the prohibition list.
--
-- A draft is a text about an artist (later, a work), drafted by the desk from sources a person can
-- check: every sentence tied to numbered sources, each source a passage with its publisher and link.
-- It carries the version of the prohibition list it was written under (the git hash of
-- docs/drafting/prohibition-list.md) and the model's name, and it stays a draft until a named person
-- approves or rejects it (M2-01 does the approving). What the desk removed is kept beside it.
--
-- Readable by the collection's owner only (rule 9 and "good looks like": a viewer, or anyone without
-- both factors, reads none). No write policy: the desk writes as the database owner on Workshop; M2-01
-- will add the owner's approval. Every write lands in the audit log, like every other table.

create type public.draft_status as enum ('draft', 'approved', 'rejected');
create type public.draft_subject as enum ('artist', 'item');

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  subject public.draft_subject not null,
  artist_id uuid references public.artists (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  field text not null check (field in ('biography', 'why_they_matter')),
  text text not null,
  sentences jsonb not null,                 -- [{ text, sources: [n, …] }]
  sources jsonb not null,                   -- [{ n, kind, title, publisher, link, passage }]
  removed jsonb not null default '[]',      -- what the desk took out, and under which rule
  flagged jsonb not null default '[]',      -- what the second reading doubted but kept
  list_version text not null,               -- git blob hash of docs/drafting/prohibition-list.md
  model text not null,                      -- the model that wrote it, as the API named it
  status public.draft_status not null default 'draft',
  decided_by uuid,                          -- auth.users id of the person who approved or rejected
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drafts_one_subject check (
    (subject = 'artist' and artist_id is not null and item_id is null)
    or (subject = 'item' and item_id is not null and artist_id is null)
  ),
  constraint drafts_decision_dated check ((status = 'draft') = (decided_by is null and decided_at is null))
);

create index drafts_artist_idx on public.drafts (artist_id, field, created_at desc);
create index drafts_item_idx on public.drafts (item_id, field, created_at desc);
create index drafts_collection_status_idx on public.drafts (collection_id, status);

create trigger drafts_set_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();
create trigger drafts_audit after insert or update or delete on public.drafts
  for each row execute function public.audit_row();

alter table public.drafts enable row level security;

create policy drafts_select on public.drafts
  for select to authenticated using (public.is_collection_owner(collection_id));

-- Grants, explicit, as the core migration asks of every later table: the signed-in may read (RLS
-- decides which rows), may not write; the anonymous role nothing; the service role everything.
revoke all on public.drafts from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.drafts from authenticated;
grant select on public.drafts to authenticated;
grant all on public.drafts to service_role;
