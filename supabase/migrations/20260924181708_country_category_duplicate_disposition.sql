begin;

-- Duplicate children are outside the canonical classification work-list. Mark
-- the retained source rows explicitly so the deployed quality profile does not
-- mistake historical duplicates for unexamined published content. Fresh
-- installs additionally exclude duplicate rows in the profile definition.
update public.venues
set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{category_backfill}',jsonb_build_object(
    'from',coalesce(category,'other'),'to',null,'confidence',1,
    'status','not_applicable','reason','duplicate_record',
    'source','country_quality_completion','at',now()),true)
where duplicate_of_id is not null
  and coalesce(category,'other')='other'
  and not (coalesce(enrichment_status,'{}'::jsonb)?'category_backfill');

update public.events
set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{event_type_backfill}',jsonb_build_object(
    'from',coalesce(event_type,'other'),'to',null,'confidence',1,
    'status','not_applicable','reason','duplicate_record',
    'source','country_quality_completion','at',now()),true)
where duplicate_of_id is not null
  and coalesce(event_type,'other')='other'
  and not (coalesce(enrichment_status,'{}'::jsonb)?'event_type_backfill');

commit;
