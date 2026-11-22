-- Tag Leather Club with dress-code at the owner's request (2026-11-22).
--
-- 99991795362478 approved this venue's proposal for private-cabins but dropped
-- dress-code because the cited text reads "No strict dresscode". This is the
-- owner's override, the same as 99991795364156 made for the other five.

select set_config('app.actor', 'migration:99991795369813_kink_leather_club_dress_code', true);

update public.venues
   set tags = coalesce(tags, '{}') || array['dress-code']
 where id = '9af9b379-cdcd-42fe-b0eb-af0c56e53382'
   and not ('dress-code' = any(coalesce(tags, '{}')));

update public.entity_review_queue
   set reviewer_note = coalesce(reviewer_note, '') || ' Dress-code added 2026-11-22 at the owner''s request.'
 where entity_id = '9af9b379-cdcd-42fe-b0eb-af0c56e53382'
   and entity_type = 'venue' and field = 'tags' and model = 'kink-tag-fill'
   and coalesce(reviewer_note, '') not like '%Dress-code added%';

do $verify$
begin
  -- Only where the venue exists: Critical paths replays this file on a capped
  -- snapshot that need not contain Leather Club. On prod it does, so the
  -- check still binds there.
  if exists (select 1 from public.venues where id = '9af9b379-cdcd-42fe-b0eb-af0c56e53382')
     and not exists (select 1 from public.venues
                      where id = '9af9b379-cdcd-42fe-b0eb-af0c56e53382'
                        and 'dress-code' = any(coalesce(tags, '{}'))) then
    raise exception 'P1 failed: Leather Club lacks dress-code';
  end if;
  if (public.kink_filter_signals()->>'venue_array_without_assignment')::int <> 0 then
    raise exception 'P2 failed: venue tags without assignments';
  end if;
end
$verify$;
