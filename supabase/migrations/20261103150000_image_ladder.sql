-- M1-02a · The ladder.
--
-- A work's picture is now a source (the archival master if there is one, else the Airtable
-- snapshot) and the renditions cut from it: 480 · 1,080 · 2,160 · 4,320 on the long side, never
-- larger than the source, AVIF and JPEG. The source row carries a 24 px stand-in that the page
-- draws before any file arrives. Masters are kept, never served — and from here on, never even
-- visible to a signed-in session: no query a page can make returns a master row.

alter table public.images
  add column derived_from_image_id uuid references public.images (id) on delete cascade,
  add column long_side int,
  add column format text check (format in ('avif', 'jpeg')),
  add column placeholder text,
  -- the tile set for zoom (M1-02b); unused until then
  add column tile_size int,
  add column tile_overlap int,
  add column levels int;

alter table public.images
  add constraint images_rendition_has_source check (kind <> 'rendition' or (derived_from_image_id is not null and format is not null and long_side is not null));

create index images_derived_from_idx on public.images (derived_from_image_id);

-- One rung of one format per source: a re-run finds it and writes nothing.
create unique index images_one_rung on public.images (derived_from_image_id, long_side, format) where kind = 'rendition';

-- One picture per work. The ingest and the masters command move it to the best source.
create unique index images_one_hero on public.images (item_id) where is_hero;

-- Masters: not readable by any signed-in person, member or not. The commands on Workshop write and
-- read them as the database owner; nothing in the app ever needs a master row.
drop policy images_select on public.images;
create policy images_select on public.images
  for select to authenticated using (public.is_collection_member(collection_id) and kind <> 'master');

-- The picture query a page uses: one row per work that has a picture — its best source's size and
-- stand-in, and the renditions cut from it. It runs as its owner (so a master source's size and
-- stand-in can be read without exposing the master's row) and so checks membership itself, with
-- the same function the row-level security uses, second factor included. It carries no storage
-- address, no bucket, no key and no master id: only rendition ids, which the image door decides.
create view public.gallery_pictures with (security_barrier = true) as
select
  s.item_id,
  s.width,
  s.height,
  s.placeholder,
  r.renditions
from public.images s
cross join lateral (
  select jsonb_agg(
           jsonb_build_object('id', x.id, 'format', x.format, 'width', x.width, 'height', x.height, 'long_side', x.long_side)
           order by x.format, x.long_side
         ) as renditions
  from public.images x
  where x.derived_from_image_id = s.id and x.kind = 'rendition'
) r
where s.is_hero
  and s.kind in ('master', 'lowres_airtable')
  and r.renditions is not null
  and public.is_collection_member(s.collection_id);

revoke all on public.gallery_pictures from anon, authenticated, public;
grant select on public.gallery_pictures to authenticated;
grant select on public.gallery_pictures to service_role;
