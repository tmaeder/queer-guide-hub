-- Repair the 117 unified_tags rows that zy_validate_tag_entity_target rejects,
-- which made every UPDATE of them raise (admin edits included).
--
-- 113 rows: publication_role='entity_redirect' with no canonical target at all.
--   99991789916000 (glossary quality programme) defaulted every entity_kind
--   'place'/'person' tag to entity_redirect. These 113 were already deprecated
--   (106) or merged (7), so no review ever gave them a target. They render no
--   page, so they become 'utility'; enforce_tag_publication_role then sets
--   seo_indexable=false (104 still carried true: a publish-on-revive trap) and
--   validate_tag_entity_target clears the empty canonical_* fields.
--
-- 4 rows: personality redirects whose target was merged away later
--   (alex-jurgen, claudia-castrosin-verdu, claudia-pia-baudracco,
--   lara-maria-bertolini). Each is repointed to its live merge survivor, the
--   same move merge_cores make for every other reference.
--
-- Postcondition: zero entity redirects fail the trigger's own check, corpus-wide.

select set_config('app.actor', 'migration:99991792772531_tag_redirect_targets_repair', true);

update public.unified_tags t
   set publication_role = 'utility',
       publication_role_review_note = 'repair: entity_redirect default with no target (inactive tag)'
 where t.publication_role = 'entity_redirect'
   and t.canonical_entity_type is null
   and t.status in ('deprecated', 'merged');

update public.unified_tags t
   set canonical_entity_id = s.id,
       canonical_entity_path = '/personalities/' || s.slug
  from public.personalities p
  join public.personalities s on s.id = p.duplicate_of_id and s.duplicate_of_id is null
 where t.publication_role = 'entity_redirect'
   and t.canonical_entity_type = 'personality'
   and t.canonical_entity_id = p.id
   and p.duplicate_of_id is not null;

do $verify$
declare v_bad bigint; v_indexable bigint;
begin
  select count(*) into v_bad
    from public.unified_tags t
   where t.publication_role = 'entity_redirect'
     and (t.canonical_entity_type is null or t.canonical_entity_id is null or t.canonical_entity_path is null
          or t.canonical_entity_path is distinct from case t.canonical_entity_type
            when 'personality' then (select '/personalities/'||x.slug from public.personalities x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'city' then (select '/city/'||x.slug from public.cities x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'country' then (select '/country/'||x.slug from public.countries x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'village' then (select '/villages/'||x.slug from public.queer_villages x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'venue' then (select '/venues/'||x.slug from public.venues x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'organization' then (select '/organizations/'||x.slug from public.organizations x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'event' then (select '/events/'||x.slug from public.events x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'hotel' then (select '/hotels/'||x.slug from public.hotels x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
            when 'community_group' then (select '/groups/'||x.id::text from public.community_groups x where x.id=t.canonical_entity_id and x.duplicate_of_id is null)
          end);
  if v_bad <> 0 then
    raise exception 'P1 failed: % entity redirects still fail zy_validate_tag_entity_target', v_bad;
  end if;

  select count(*) into v_indexable
    from public.unified_tags
   where publication_role_review_note = 'repair: entity_redirect default with no target (inactive tag)'
     and seo_indexable;
  if v_indexable <> 0 then
    raise exception 'P2 failed: % repaired inactive tags are still seo_indexable', v_indexable;
  end if;
end
$verify$;
