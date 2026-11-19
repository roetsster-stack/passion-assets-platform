-- M2-01 · Artists, and why they matter: the owner approves.
--
-- A draft becomes the artist's text only when the collection's owner, signed in with both factors,
-- approves it — through one function, decide_draft, which checks the owner, stamps the person and the
-- time, copies the approved text into the artist's biography or why_they_matter, sets verified_at and
-- verified_by (the fields waiting since M1-01), and keeps the link to the draft so the text's sources
-- travel with it. A rejection carries a note, which the desk reads for the next draft (`answers` on
-- the draft that answers it). The biography and why they matter are decided separately (trade-off 2).
-- Nothing else writes these fields from a signed-in session: the browser can only call the function,
-- and the function refuses anyone but the owner, and the owner half-signed-in.
--
-- Everyone the owner invites reads approved texts and their sources through one view, approved_texts,
-- and nothing else of a draft: not what the desk removed, not a note, not a draft that still waits
-- ("Catherina sees approved texts and their sources. She never sees a draft, a removal or a note").

-- The note on a rejected draft, and the rejected draft a new one answers.
alter table public.drafts
  add column note text,
  add column answers uuid references public.drafts (id) on delete set null;

-- The artist's approved texts point back to the drafts they came from.
alter table public.artists
  add column biography_draft_id uuid references public.drafts (id) on delete set null,
  add column why_they_matter_draft_id uuid references public.drafts (id) on delete set null;

-- The one door: approve, or reject with a note. Owner's rights (security definer) so it may write
-- the drafts and the artists, which no signed-in session may; the owner check is the same function
-- row-level security uses, and it needs both factors.
create or replace function public.decide_draft(p_draft uuid, p_decision text, p_note text default null)
returns public.drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.drafts;
  who uuid := auth.uid();
begin
  select * into d from public.drafts where id = p_draft for update;
  -- the owner alone, with both factors; anyone else learns nothing, not even whether the draft exists
  if d.id is null or who is null or not public.is_collection_owner(d.collection_id) then
    raise exception 'only the collection''s owner, signed in with both factors, may decide a draft' using errcode = '42501';
  end if;
  if d.status <> 'draft' then
    raise exception 'this draft was already decided' using errcode = 'P0001';
  end if;
  if d.subject <> 'artist' then
    raise exception 'only a draft about an artist can be decided yet' using errcode = 'P0001';
  end if;

  if p_decision = 'approved' then
    -- the list's own sentence (rule 10) is an answer, not a text: approved, it would sit under every work by the
    -- artist as a placeholder (the review of PR #14, should-fix 1)
    if btrim(d.text, E' \t\r\n') = 'Not enough is known yet.' then
      raise exception 'the list''s own sentence is not a text to approve: send it back with a note, or leave it for later' using errcode = 'P0001';
    end if;
    update public.drafts set status = 'approved', decided_by = who, decided_at = now() where id = d.id returning * into d;
    if d.field = 'biography' then
      update public.artists set biography = d.text, biography_draft_id = d.id, verified_at = d.decided_at, verified_by = who where id = d.artist_id;
    else
      update public.artists set why_they_matter = d.text, why_they_matter_draft_id = d.id, verified_at = d.decided_at, verified_by = who where id = d.artist_id;
    end if;
  elsif p_decision = 'rejected' then
    if p_note is null or p_note ~ '^\s*$' then
      raise exception 'a rejection carries a note: say what to change' using errcode = 'P0001';
    end if;
    update public.drafts set status = 'rejected', decided_by = who, decided_at = now(), note = btrim(p_note, E' \t\r\n') where id = d.id returning * into d;
  else
    raise exception 'a decision is ''approved'' or ''rejected''' using errcode = 'P0001';
  end if;
  return d;
end;
$$;

-- Supabase grants execute on new functions to every role by default; here the signed-in and the service
-- role only. (The anonymous role would be refused inside the function too: it has no auth.uid().)
revoke all on function public.decide_draft(uuid, text, text) from public, anon;
grant execute on function public.decide_draft(uuid, text, text) to authenticated, service_role;

-- What every member reads of a draft: an approved text and its sources — and only the text the artist
-- carries now, never a draft that still waits, a rejected one, or one since replaced. Owner's rights
-- (security_invoker off) so it can read drafts, which the viewer cannot; the membership check is in the
-- view itself, with both factors, and security_barrier keeps it ahead of any other filter. Supabase's
-- Security Advisor flags such a view ("Security Definer View"); that is this view, on purpose.
-- Of the draft's sources — the desk stores one shared list on both fields' drafts — only those the
-- text's own sentences cite are returned: a passage the other field's draft cites, which may still be
-- waiting or have been sent back, is nothing a member reads (the review of PR #14, should-fix 3).
create view public.approved_texts
  with (security_invoker = false, security_barrier = true)
as
  select d.id, d.collection_id, d.artist_id, d.field, d.text, d.sentences,
         (select coalesce(jsonb_agg(s order by (s ->> 'n')::int), '[]'::jsonb)
            from jsonb_array_elements(d.sources) s
           where (s ->> 'n')::int in (select c::int from jsonb_array_elements(d.sentences) sen, jsonb_array_elements_text(sen -> 'sources') c)) as sources,
         d.decided_at, d.created_at
    from public.drafts d
    join public.artists a on a.id = d.artist_id
   where d.status = 'approved'
     and d.subject = 'artist'
     and (a.biography_draft_id = d.id or a.why_they_matter_draft_id = d.id)
     and public.is_collection_member(d.collection_id);

revoke all on public.approved_texts from anon, public;
grant select on public.approved_texts to authenticated, service_role;
