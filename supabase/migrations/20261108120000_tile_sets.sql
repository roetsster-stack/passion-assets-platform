-- M1-02b · The glass.
--
-- A tile set is one row on images (kind 'tile_set'): the Deep Zoom pyramid cut from a work's
-- picture source when that source is 4,000 px or more on its long side. Its storage_key is the
-- prefix under which the tiles live; width and height are the source's; tile_size, tile_overlap
-- and levels describe the pyramid, so the tile door can refuse any address outside it.

alter table public.images
  add constraint images_tile_set_shape check (
    kind <> 'tile_set'
    or (derived_from_image_id is not null and tile_size is not null and tile_overlap is not null
        and levels is not null and width is not null and height is not null)
  );

-- One pyramid per source: a re-run finds it and cuts nothing.
create unique index images_one_tile_set on public.images (derived_from_image_id) where kind = 'tile_set';

-- The picture query gains the work's tile set, when its picture source has one. Still no storage
-- address, no bucket, no key and no master id: the tile set's own id, which the tile door decides.
create or replace view public.gallery_pictures with (security_barrier = true) as
select
  s.item_id,
  s.width,
  s.height,
  s.placeholder,
  r.renditions,
  (
    select jsonb_build_object('id', t.id, 'width', t.width, 'height', t.height, 'tile_size', t.tile_size, 'tile_overlap', t.tile_overlap, 'levels', t.levels)
    from public.images t
    where t.derived_from_image_id = s.id and t.kind = 'tile_set'
    limit 1
  ) as tile_set
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
