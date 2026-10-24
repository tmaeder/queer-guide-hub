-- qcal event images: repoint https://qcal.app/assets/... -> https://cdn.queercalendar.app/assets/...
--
-- source-qcal built image URLs as `https://qcal.app${imagePath}`. That path
-- answers 404 and sets a third-party `__cf_bm` cookie, so every qcal event
-- rendered a broken image and dropped Lighthouse best-practices on /events
-- (lighthouse run 40096103622). qcal's own frontend builds
-- `https://cdn.queercalendar.app/${imagePath}`; all sampled paths return 200
-- there with no cookie. The parser is fixed in qcal-parse.ts; this repairs the
-- rows already written. Prefix rewrite only — the path is unchanged.
-- search_documents re-index from events via the existing sync trigger.

update public.events
set images = array(
  select replace(x, 'https://qcal.app/assets/', 'https://cdn.queercalendar.app/assets/')
  from unnest(images) with ordinality as u(x, n)
  order by n
)
where array_to_string(images, ' ') like '%https://qcal.app/assets/%';

-- Staging rows not yet committed would otherwise write the old URL back.
update public.ingestion_staging
set raw_data = replace(raw_data::text, 'https://qcal.app/assets/', 'https://cdn.queercalendar.app/assets/')::jsonb,
    normalized_data = replace(normalized_data::text, 'https://qcal.app/assets/', 'https://cdn.queercalendar.app/assets/')::jsonb,
    enriched_data = replace(enriched_data::text, 'https://qcal.app/assets/', 'https://cdn.queercalendar.app/assets/')::jsonb
where review_status not in ('approved', 'rejected', 'auto')
  and (raw_data::text like '%https://qcal.app/assets/%'
    or normalized_data::text like '%https://qcal.app/assets/%'
    or enriched_data::text like '%https://qcal.app/assets/%');

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.events
  where array_to_string(images, ' ') like '%https://qcal.app/assets/%';
  if v_bad <> 0 then
    raise exception 'qcal image repair: % events still carry qcal.app/assets URLs', v_bad;
  end if;
end
$verify$;
