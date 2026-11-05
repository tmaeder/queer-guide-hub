-- /admin/geography "Linked content": the venue/event/hotel counts now link to
-- the CMS list filtered to this place (city_id / country_id / queer_village_id).
-- A count that links to a list must count what that list shows by default, or
-- "1 venue" opens an empty list. The CMS lists default to the LIVE, UNMERGED
-- slice of each type (contentTypes/*.ts `merge` + `lifecycle.archive`):
--   venues  duplicate_of_id is null, review_status is distinct from 'archived'
--   events  duplicate_of_id is null, status is distinct from 'cancelled'
--   hotels  duplicate_of_id is null, archived_at is null
-- The old counts excluded merged venues/events only, and counted every hotel.
--
-- Patched from the live definition with exactly-once anchors rather than
-- restated, so unrelated later edits to the function survive.
do $patch$
declare
  v_def text := pg_get_functiondef('api_private.geo_cms_record(uuid)'::regprocedure);
  v_new text := v_def;
  r record;
begin
  for r in
    select * from (values
      ('from venues v where v.duplicate_of_id is null and',
       'from venues v where v.duplicate_of_id is null and v.review_status is distinct from ''archived'' and'),
      ('from events e where e.duplicate_of_id is null and',
       'from events e where e.duplicate_of_id is null and e.status is distinct from ''cancelled'' and'),
      ('from hotels h where case',
       'from hotels h where h.duplicate_of_id is null and h.archived_at is null and case')
    ) as a(anchor, repl)
  loop
    if (length(v_new) - length(replace(v_new, r.anchor, ''))) / length(r.anchor) <> 1 then
      raise exception 'geo_cms_record anchor not found exactly once: %', r.anchor;
    end if;
    v_new := replace(v_new, r.anchor, r.repl);
  end loop;
  execute v_new;
end
$patch$;

do $verify$
declare
  v_src text := regexp_replace(
    pg_get_functiondef('api_private.geo_cms_record(uuid)'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('v.review_status is distinct from ''archived''' in v_src) = 0
     or position('e.status is distinct from ''cancelled''' in v_src) = 0
     or position('h.archived_at is null' in v_src) = 0 then
    raise exception 'geo_cms_record counts not scoped to the CMS list slice';
  end if;
end
$verify$;
