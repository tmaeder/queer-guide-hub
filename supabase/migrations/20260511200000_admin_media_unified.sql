-- Unified media view for admin media library
-- Merges image_assets + cms_media into one paginated, filterable view.

-- 1. Add starred columns
alter table public.image_assets
  add column if not exists starred boolean not null default false;

alter table public.cms_media
  add column if not exists starred boolean not null default false;

-- 2. Unified view
create or replace view public.admin_media_unified as

-- image_assets
select
  ia.id,
  'image_asset'::text                          as source_type,
  coalesce(
    nullif(ia.alt_text, ''),
    split_part(ia.url, '/', -1)
  )                                            as display_name,
  ia.url,
  ia.thumbnail_url,
  ia.width,
  ia.height,
  ia.bytes                                     as file_size,
  coalesce('image/' || ia.format, 'image/jpeg') as mime_type,
  ia.format,
  ia.source,
  ia.license,
  ia.attribution,
  ia.alt_text,
  null::jsonb                                  as alt_text_i18n,
  null::jsonb                                  as caption_i18n,
  ia.phash,
  ia.content_hash,
  ia.is_flagged,
  ia.flagged_reason,
  ia.status                                    as asset_status,
  coalesce(ia.optimization_status, 'pending')  as optimization_status,
  ia.metadata,
  ia.created_at,
  ia.updated_at,
  null::uuid                                   as uploaded_by,
  null::text                                   as storage_path,
  null::text                                   as bucket_name,
  ia.starred,
  (select count(*)::int from public.image_asset_links l where l.asset_id = ia.id)
                                               as usage_count,
  (select array_agg(distinct l.entity_type) from public.image_asset_links l where l.asset_id = ia.id)
                                               as entity_types
from public.image_assets ia
where ia.status = 'active'

union all

-- cms_media
select
  cm.id,
  'cms_media'::text                            as source_type,
  cm.original_filename                         as display_name,
  case
    when cm.storage_path is not null
    then 'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/cms-media/' || cm.storage_path
    else cm.source_url
  end                                          as url,
  null::text                                   as thumbnail_url,
  cm.width,
  cm.height,
  cm.file_size,
  cm.mime_type,
  split_part(cm.mime_type, '/', 2)             as format,
  coalesce(cm.external_source, 'upload')       as source,
  cm.license,
  cm.attribution,
  (cm.alt_text ->> 'en')::text                as alt_text,
  cm.alt_text                                  as alt_text_i18n,
  cm.caption                                   as caption_i18n,
  null::text                                   as phash,
  null::text                                   as content_hash,
  false                                        as is_flagged,
  null::text                                   as flagged_reason,
  'active'::text                               as asset_status,
  'not_optimized'::text                        as optimization_status,
  '{}'::jsonb                                  as metadata,
  cm.created_at,
  cm.created_at                                as updated_at,
  cm.uploaded_by,
  cm.storage_path,
  'cms-media'::text                            as bucket_name,
  cm.starred,
  (select count(*)::int from public.cms_content_media ccm where ccm.media_id = cm.id)
  + (select count(*)::int from public.cms_media_attachments cma where cma.media_id = cm.id)
                                               as usage_count,
  array[]::text[]                              as entity_types
from public.cms_media cm;

-- 3. RLS: views inherit the underlying table policies, but grant select to authenticated
grant select on public.admin_media_unified to authenticated;

-- 4. Index on starred for fast filter
create index if not exists idx_image_assets_starred on public.image_assets (starred) where starred = true;
create index if not exists idx_cms_media_starred on public.cms_media (starred) where starred = true;
