-- SEC-02 · The viewer sees the works, not the register.
--
-- Anyone invited as a viewer — and, until the advisor door is specced, an advisor — reads the works
-- and what is said about them: the tombstone, how a work came, its provenance, its pictures. Nothing
-- the register knows about money, place, ownership or private notes. Enforced here, by the
-- database, not by the screens.
--
-- How: the sensitive fields of a work move out of `items` into a companion table, `item_private`,
-- one row per work, readable by the collection's owner alone and only with both factors. Postgres
-- secures rows, so a table the viewer cannot read at all is the simplest thing to prove and the
-- hardest to open by accident. The owners, who owns what, and the documents (invoices,
-- certificates) become owner-only the same way. Nothing a screen reads moves: the wall and the
-- single work select the same columns of `items` as before. The ingest writes both halves of a
-- work in one transaction.
--
-- This migration moves the data inside the live database once, and the move itself is in the
-- audit log: the table's triggers, policy and grants are in place before a row is copied, so every
-- private row's first entry reads `migration:sec-02` (the cold review of PR #13, should-fix 3).
-- The order of going live — M2-04b first, then this, then the migrations, then one ingest — is in
-- the BUILT note of docs/specs/SEC-02_viewer_least_privilege.md.

select set_config('app.actor', 'migration:sec-02', false);

create table public.item_private (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.items (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,

  -- acquisition: the money
  purchase_price numeric(14, 2),
  purchase_currency text,
  purchase_price_zar numeric(14, 2),

  -- valuation — stored, never shown (principle 1). Airtable's "Last Modified" watches Current Value
  -- only, so it is the date the value was last set: the valuation's own date, and it moves with it
  -- (the review's blocker 1).
  current_value numeric(14, 2),
  current_value_currency text,
  valuation_date date,
  valuation_source text,
  airtable_modified_at timestamptz,

  -- place and state — sensitive classes
  location text,
  location_tags text[] not null default '{}',
  condition_note text,

  -- private notes
  admin_notes text,
  comments_raw text,
  notes_raw text,

  -- the record as imported: it carries all of the above
  airtable_raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_private_collection_idx on public.item_private (collection_id);

-- Triggers, row-level security, the policy and the grants first, so that the move below is audited
-- and the table is never open, not even for the length of this migration.
create trigger item_private_set_updated_at before update on public.item_private
  for each row execute function public.set_updated_at();
create trigger item_private_audit after insert or update or delete on public.item_private
  for each row execute function public.audit_row();

alter table public.item_private enable row level security;

create policy item_private_select on public.item_private
  for select to authenticated using (public.is_collection_owner(collection_id));

-- Grants, explicit, as the core migration asks of every later table: the signed-in may read (RLS
-- decides which rows — the owner's, with both factors), may not write; the anonymous role nothing;
-- the service role everything.
revoke all on public.item_private from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.item_private from authenticated;
grant select on public.item_private to authenticated;
grant all on public.item_private to service_role;

-- The data moves: one private row per work, from the columns `items` carried until now — every
-- insert written to the audit log as `migration:sec-02`.
insert into public.item_private (
  item_id, collection_id,
  purchase_price, purchase_currency, purchase_price_zar,
  current_value, current_value_currency, valuation_date, valuation_source, airtable_modified_at,
  location, location_tags, condition_note,
  admin_notes, comments_raw, notes_raw,
  airtable_raw, created_at, updated_at
)
select
  id, collection_id,
  purchase_price, purchase_currency, purchase_price_zar,
  current_value, current_value_currency, valuation_date, valuation_source, airtable_modified_at,
  location, location_tags, condition_note,
  admin_notes, comments_raw, notes_raw,
  airtable_raw, created_at, updated_at
from public.items;

-- And leave `items` with what any member may read. New sensitive fields (M2-02, M2-03: location,
-- condition, valuation) are added to item_private, never here; the database test holds the list of
-- what `items` may carry, so a new column fails CI until it is placed on purpose.
alter table public.items
  drop column purchase_price,
  drop column purchase_currency,
  drop column purchase_price_zar,
  drop column current_value,
  drop column current_value_currency,
  drop column valuation_date,
  drop column valuation_source,
  drop column airtable_modified_at,
  drop column location,
  drop column location_tags,
  drop column condition_note,
  drop column admin_notes,
  drop column comments_raw,
  drop column notes_raw,
  drop column airtable_raw;

-- The owners, who owns what, and the documents: the owner's alone from here on. An advisor reads
-- none until the advisor door is specced; a certificate of authenticity could be opened to viewers
-- later, by kind, if wanted.
drop policy owners_select on public.owners;
create policy owners_select on public.owners
  for select to authenticated using (public.is_collection_owner(collection_id));

drop policy item_owners_select on public.item_owners;
create policy item_owners_select on public.item_owners
  for select to authenticated using (public.is_collection_owner(collection_id));

drop policy documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated using (public.is_collection_owner(collection_id));

select set_config('app.actor', '', false);
