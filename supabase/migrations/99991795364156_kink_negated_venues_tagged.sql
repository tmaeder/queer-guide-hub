-- Tag the 5 venues whose kink-tag-fill proposals were rejected by
-- 99991795362478 because the cited sentence negates the term, at the owner's
-- request (2026-11-22: "tag the 5 negated venues anyway").
--
--   Jail, Camp, Eagle Vienna, Cuckoo's Nest  -> dress-code
--   Klub Sauna Galla                         -> private-cabins
--
-- The cited text says the opposite ("No dress code", "without dresscode",
-- "but not private cabins"); this is the owner's override, recorded on the
-- review rows. Leather Club's dropped dress-code is NOT included: it was part
-- of an approved row, not one of the five rejections.

select set_config('app.actor', 'migration:99991795364156_kink_negated_venues_tagged', true);

create temporary table _kink_override (venue_id uuid, slug text) on commit drop;
insert into _kink_override values
  ('4bfe2984-7bb2-4c34-8ff3-508674ffa386', 'dress-code'),
  ('6ac59852-2f39-4de3-9855-491072e42d30', 'dress-code'),
  ('a8925514-d408-440a-9883-eef53333ff04', 'dress-code'),
  ('c837bbe9-af5e-4f21-af34-c862b440b713', 'dress-code'),
  ('de1376c1-a274-438c-9ad4-a2b888080ff3', 'private-cabins');

update public.venues v
   set tags = coalesce(v.tags, '{}') || array[o.slug]
  from _kink_override o
 where v.id = o.venue_id and not (o.slug = any(coalesce(v.tags, '{}')));

update public.entity_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'Approved 2026-11-22 at the owner''s request despite the cited sentence negating the term (was rejected by 99991795362478).'
  from _kink_override o
 where q.entity_id = o.venue_id and q.entity_type = 'venue' and q.field = 'tags'
   and q.model = 'kink-tag-fill' and q.status = 'rejected';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad
    from _kink_override o join public.venues v on v.id = o.venue_id
   where not (o.slug = any(coalesce(v.tags, '{}')));
  if v_bad <> 0 then
    raise exception 'P1 failed: % of the five venues lack their tag', v_bad;
  end if;
  if (select count(*) from public.entity_review_queue
       where model = 'kink-tag-fill' and field = 'tags' and status = 'rejected') <> 0 then
    raise exception 'P2 failed: kink-tag-fill rows still rejected';
  end if;
  if (public.kink_filter_signals()->>'venue_array_without_assignment')::int <> 0 then
    raise exception 'P3 failed: venue tags without assignments';
  end if;
end
$verify$;
