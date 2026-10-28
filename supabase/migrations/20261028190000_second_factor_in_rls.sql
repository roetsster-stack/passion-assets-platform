-- M1-04 · The second factor, enforced by the database.
--
-- A session proves a person twice: the emailed link (assurance level aal1) and the authenticator
-- code (aal2). The screens send a half-signed-in session to the second-factor screen; this makes
-- the database refuse it as well, so no later screen can forget. Supabase carries the level in the
-- session's JWT as the `aal` claim.

create or replace function public.is_collection_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
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
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1 from public.collection_members m
       where m.collection_id = cid and m.user_id = auth.uid() and m.role = 'owner'
     );
$$;
