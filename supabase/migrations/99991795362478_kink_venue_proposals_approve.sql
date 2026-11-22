-- Approve the kink-tag-fill venue proposals, at the owner's request
-- (2026-11-22: "approve the 323 venue tag proposals").
--
-- 323 open entity_review_queue rows (entity_type 'venue', field 'tags', model
-- 'kink-tag-fill') proposed: private-cabins 159, leather 71, dress-code 60,
-- rubber 33, underwear-party 11, sneakers 9, puppy-play 7.
--
-- Hand-read before applying: dress-code 38/40 and cabins ~27/30 correct. Every
-- miss was the sentence NEGATING the term ("No dress code", "without
-- dresscode", "but not private cabins"), so those six (venue, tag) pairs are
-- excluded rather than applied:
--   Jail, Camp, Eagle Vienna, Cuckoo's Nest  dress-code   -> row rejected
--   Klub Sauna Galla                         private-cabins -> row rejected
--   Leather Club                             dress-code dropped, private-cabins approved
--
-- Applied directly (not through approve_entity_review, which needs an admin
-- JWT a migration does not have). reviewer_id stays NULL and the note says
-- whose decision it was. The tag-sync trigger from 99991795359027 writes the
-- matching unified_tag_assignments rows.

select set_config('app.actor', 'migration:99991795362478_kink_venue_proposals_approve', true);

create temporary table _kink_excluded (venue_id uuid, slug text) on commit drop;
insert into _kink_excluded values
  ('4bfe2984-7bb2-4c34-8ff3-508674ffa386', 'dress-code'),
  ('6ac59852-2f39-4de3-9855-491072e42d30', 'dress-code'),
  ('9af9b379-cdcd-42fe-b0eb-af0c56e53382', 'dress-code'),
  ('a8925514-d408-440a-9883-eef53333ff04', 'dress-code'),
  ('c837bbe9-af5e-4f21-af34-c862b440b713', 'dress-code'),
  ('de1376c1-a274-438c-9ad4-a2b888080ff3', 'private-cabins');

create temporary table _kink_prop on commit drop as
select q.id, q.entity_id,
       array(select s from jsonb_array_elements_text(q.proposed_value->'value') s
              where not exists (select 1 from _kink_excluded x
                                 where x.venue_id = q.entity_id and x.slug = s)) as keep
  from public.entity_review_queue q
 where q.entity_type = 'venue' and q.field = 'tags' and q.status = 'open'
   and q.model = 'kink-tag-fill';

update public.venues v
   set tags = coalesce(v.tags, '{}') || array(
         select s from unnest(p.keep) s where not (s = any(coalesce(v.tags, '{}'))))
  from _kink_prop p
 where v.id = p.entity_id and cardinality(p.keep) > 0
   and exists (select 1 from unnest(p.keep) s where not (s = any(coalesce(v.tags, '{}'))));

update public.entity_review_queue q
   set status = case when cardinality(p.keep) > 0 then 'approved' else 'rejected' end,
       reviewed_at = now(),
       reviewer_note = case
         when cardinality(p.keep) = 0
           then 'Rejected 2026-11-22: the cited sentence negates the term (e.g. "no dress code").'
         when cardinality(p.keep) < jsonb_array_length(q.proposed_value->'value')
           then 'Approved in bulk at the owner''s request 2026-11-22; dropped a negated term (dress-code).'
         else 'Approved in bulk at the owner''s request 2026-11-22.'
       end
  from _kink_prop p
 where q.id = p.id;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.entity_review_queue
   where entity_type = 'venue' and field = 'tags' and status = 'open' and model = 'kink-tag-fill';
  if v_bad <> 0 then
    raise exception 'P1 failed: % kink-tag-fill proposals still open', v_bad;
  end if;

  -- Every approved slug is on its venue.
  select count(*) into v_bad
    from public.entity_review_queue q
    cross join lateral jsonb_array_elements_text(q.proposed_value->'value') s(slug)
    join public.venues v on v.id = q.entity_id
   where q.model = 'kink-tag-fill' and q.field = 'tags' and q.status = 'approved'
     and not exists (select 1 from _kink_excluded x where x.venue_id = q.entity_id and x.slug = s.slug)
     and not (s.slug = any(coalesce(v.tags, '{}')));
  if v_bad <> 0 then
    raise exception 'P2 failed: % approved tags missing from their venue', v_bad;
  end if;

  -- No excluded (negated) pair was applied.
  select count(*) into v_bad
    from _kink_excluded x join public.venues v on v.id = x.venue_id
   where x.slug = any(coalesce(v.tags, '{}'));
  if v_bad <> 0 then
    raise exception 'P3 failed: % negated pairs were tagged anyway', v_bad;
  end if;

  -- Arrays and assignments stay in step.
  if (public.kink_filter_signals()->>'venue_array_without_assignment')::int <> 0 then
    raise exception 'P4 failed: venue tags without assignments';
  end if;
end
$verify$;
