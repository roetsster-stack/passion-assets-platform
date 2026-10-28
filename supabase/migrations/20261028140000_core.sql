-- M1-01 · The core schema.
--
-- One record, three doors (principle 3): every table carries `collection_id`, and one policy
-- pattern — "the caller is a member of this collection" — governs every read. Private by default
-- (principle 4) is therefore enforced by the database, not by application code.
--
-- Writes in V1 come only from the ingest, which connects with the database owner role and so
-- bypasses RLS; no insert/update/delete policies exist for signed-in users yet. They arrive with the
-- features that need them, one at a time.
--
-- Art only in V1: `category` keeps the seam; there are no wine, watch, car or book columns.
-- Sold works stay in the register: `sold` is a status, never a deletion.

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'advisor', 'viewer');
create type public.owner_kind as enum ('person', 'joint', 'company', 'trust', 'vehicle');
create type public.item_category as enum ('art');
create type public.item_status as enum (
  'hung', 'in_storage', 'on_loan', 'in_transit', 'at_framer', 'with_artist', 'sold', 'gifted', 'unknown'
);
create type public.visibility as enum ('private', 'named', 'peer', 'public');
create type public.image_kind as enum ('lowres_airtable', 'master', 'rendition', 'tile_set');
create type public.document_kind as enum ('invoice', 'coa', 'other');
create type public.provenance_event_type as enum (
  'purchase', 'gift', 'exhibition', 'loan', 'sale', 'alteration', 'other'
);

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The audit log — every write, every table, from the first migration
-- ---------------------------------------------------------------------------------------------

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,                 -- auth.uid() when a signed-in user wrote; null for jobs
  actor_label text,           -- 'ingest:airtable', a JWT role, or the database role
  collection_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb
);

create index audit_log_collection_at_idx on public.audit_log (collection_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  cid uuid;
  rid text;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := coalesce(
    rec ->> 'id',
    (rec ->> 'collection_id') || ':' || (rec ->> 'user_id'),   -- collection_members
    (rec ->> 'item_id') || ':' || (rec ->> 'owner_id')         -- item_owners
  );
  cid := coalesce(
    (rec ->> 'collection_id')::uuid,
    case when tg_table_name = 'collections' then (rec ->> 'id')::uuid end
  );
  insert into public.audit_log (actor, actor_label, collection_id, table_name, row_id, action, old_row, new_row)
  values (
    auth.uid(),
    coalesce(
      nullif(current_setting('app.actor', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      nullif(current_setting('request.jwt.claim.role', true), ''),
      current_user::text
    ),
    cid,
    tg_table_name,
    rid,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Collections and membership — the seam for three doors and for many collections per principal
-- ---------------------------------------------------------------------------------------------

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- ---------------------------------------------------------------------------------------------
-- The ownership graph — sensitive class
-- ---------------------------------------------------------------------------------------------

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null,
  kind public.owner_kind not null default 'person',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, name)
);

-- ---------------------------------------------------------------------------------------------
-- Artists — an entity, not three text fields per work
-- ---------------------------------------------------------------------------------------------

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  surname text not null,
  given_name text,
  display_name text not null,
  normalized_key text not null,          -- lower(surname) || '|' || lower(given_name)
  nationality text[] not null default '{}',
  birth_year int,                        -- M2
  death_year int,                        -- M2
  biography text,                        -- M2, AI-drafted
  why_they_matter text,                  -- M2, AI-drafted
  verified_at timestamptz,               -- M2, set by a human only
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, normalized_key)
);

-- ---------------------------------------------------------------------------------------------
-- Items — the core record
-- ---------------------------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  category public.item_category not null default 'art',
  artist_id uuid references public.artists (id) on delete set null,

  -- tombstone
  title text,
  year_text text,                        -- as entered ("2o24", "Circa 1980's", "Undated")
  year int,                              -- parsed; null when the text does not yield one
  medium text,
  materials text,
  dimensions_framed text,
  dimensions_unframed text,
  edition text,

  -- acquisition
  acquired_on date,
  purchase_price numeric(14, 2),
  purchase_currency text,
  purchase_price_zar numeric(14, 2),
  acquired_from text,                    -- Airtable "Sourced"
  credit_gallery text,                   -- Airtable "Gallery" (credit line)

  -- valuation — stored, never shown in M1 (principle 1)
  current_value numeric(14, 2),
  current_value_currency text,
  valuation_date date,                   -- M2
  valuation_source text,                 -- M2

  -- state — sensitive class
  status public.item_status not null default 'unknown',
  sold_year int,
  location text,
  location_tags text[] not null default '{}',   -- Airtable "Location" as entered
  condition_note text,

  -- narrative — M2 fills; the raw text travels now
  collectors_story text,
  work_context text,
  admin_notes text,
  comments_raw text,
  notes_raw text,
  links text,

  -- register flags, as kept in Airtable
  has_high_res boolean,
  has_low_res boolean,
  has_invoice boolean,
  has_coa boolean,
  high_res_note text,

  -- privacy — architectural, on every object
  visibility public.visibility not null default 'private',

  -- where this row came from
  airtable_record_id text unique,
  airtable_raw jsonb,
  airtable_modified_at timestamptz,
  content_hash text,
  -- set when the source record disappears; the ingest never deletes a work. Cleared if it returns.
  source_removed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_collection_idx on public.items (collection_id);
create index items_artist_idx on public.items (artist_id);
create index items_acquired_idx on public.items (collection_id, acquired_on);

create table public.item_owners (
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  owner_id uuid not null references public.owners (id) on delete cascade,
  share numeric(5, 2),                   -- percent; null = unspecified
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  primary key (item_id, owner_id)
);

-- ---------------------------------------------------------------------------------------------
-- Provenance — the line travels as the line until M2-03 structures it
-- ---------------------------------------------------------------------------------------------

create table public.provenance_events (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  label text not null,
  event_type public.provenance_event_type,   -- M2-03
  event_date date,                           -- M2-03
  party text,                                -- M2-03
  details_url text,
  reviews text,
  added_info text,
  sort_order int not null default 0,
  airtable_record_id text,
  airtable_raw jsonb,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (airtable_record_id, item_id)
);

create index provenance_item_idx on public.provenance_events (item_id);

-- ---------------------------------------------------------------------------------------------
-- Images and documents — our storage, never Airtable's expiring links
-- ---------------------------------------------------------------------------------------------

create table public.images (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  kind public.image_kind not null,
  storage_bucket text not null,
  storage_key text not null,
  content_type text,
  bytes bigint,
  width int,
  height int,
  sha256 text,
  source text,                           -- 'airtable', 'photographer', …
  source_ref text,                       -- the Airtable attachment id
  original_filename text,
  is_hero boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_key)
);

create index images_item_idx on public.images (item_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  kind public.document_kind not null,
  storage_bucket text not null,
  storage_key text not null,
  content_type text,
  bytes bigint,
  sha256 text,
  source text,
  source_ref text,
  original_filename text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_key)
);

create index documents_item_idx on public.documents (item_id);

-- ---------------------------------------------------------------------------------------------
-- Ingest runs — every import leaves a record
-- ---------------------------------------------------------------------------------------------

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  source text not null default 'airtable',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  counts jsonb,
  error text,
  run_by text
);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['collections', 'owners', 'artists', 'items', 'provenance_events', 'images', 'documents']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;

  foreach t in array array['collections', 'collection_members', 'owners', 'artists', 'items', 'item_owners',
                           'provenance_events', 'images', 'documents', 'ingest_runs']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security — on every table, from the first migration
-- ---------------------------------------------------------------------------------------------

-- Is the signed-in user a member of this collection? SECURITY DEFINER so that policies on
-- collection_members itself do not recurse. The search_path is pinned.
create or replace function public.is_collection_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.collection_members m
    where m.collection_id = cid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_collection_owner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.collection_members m
    where m.collection_id = cid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

revoke all on function public.is_collection_member(uuid) from public;
revoke all on function public.is_collection_owner(uuid) from public;
grant execute on function public.is_collection_member(uuid) to authenticated, anon, service_role;
grant execute on function public.is_collection_owner(uuid) to authenticated, anon, service_role;


alter table public.collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.owners enable row level security;
alter table public.artists enable row level security;
alter table public.items enable row level security;
alter table public.item_owners enable row level security;
alter table public.provenance_events enable row level security;
alter table public.images enable row level security;
alter table public.documents enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.audit_log enable row level security;

-- Read: members of the collection. No write policies in V1 — writes come from the ingest only.
create policy collections_select on public.collections
  for select to authenticated using (public.is_collection_member(id));

create policy collection_members_select on public.collection_members
  for select to authenticated using (public.is_collection_member(collection_id));

create policy owners_select on public.owners
  for select to authenticated using (public.is_collection_member(collection_id));

create policy artists_select on public.artists
  for select to authenticated using (public.is_collection_member(collection_id));

create policy items_select on public.items
  for select to authenticated using (public.is_collection_member(collection_id));

create policy item_owners_select on public.item_owners
  for select to authenticated using (public.is_collection_member(collection_id));

create policy provenance_events_select on public.provenance_events
  for select to authenticated using (public.is_collection_member(collection_id));

create policy images_select on public.images
  for select to authenticated using (public.is_collection_member(collection_id));

create policy documents_select on public.documents
  for select to authenticated using (public.is_collection_member(collection_id));

-- The run log and the audit log: owners of the collection only.
create policy ingest_runs_select on public.ingest_runs
  for select to authenticated using (public.is_collection_owner(collection_id));

create policy audit_log_select on public.audit_log
  for select to authenticated using (collection_id is not null and public.is_collection_owner(collection_id));

-- Grants. Signed-in users may read (RLS decides which rows) and may not write — not even TRUNCATE,
-- which RLS does not govern; the anonymous role may do nothing at all — nothing renders without
-- sign-in; the service role (and the ingest, as the database owner) may write. A fresh Supabase
-- project grants ALL to these roles by default, on existing tables and on future ones, so both the
-- tables and the defaults are set explicitly here and in every later migration that adds a table.
grant usage on schema public to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
