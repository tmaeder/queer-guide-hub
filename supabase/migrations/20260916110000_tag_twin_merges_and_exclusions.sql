-- Tag DQ Phase 0.1 (plan 2026-08-22): 19 active tag pairs share a display name.
-- Three classes, three treatments:
--   A) same concept (identical wikidata_id, or occ-* occasion twins of generic
--      nouns) -> merge through the reversible merge engine (merge_tag_concept)
--   B) deliberate sense split: mat-* marketplace material tags vs their is_adult
--      fetish twins (leather/rubber/denim/lace/metal/spandex). Merging would
--      either adult-flag thousands of material listings (safe-mode hides them)
--      or strip adult gating from fetish content -> permanent do-not-merge
--      exclusions instead.
--   C) ambiguous (different QIDs on the pride pair, sensitivity divergence on
--      gym, one-sided QID on a person pair) -> tag_merge_review for the cockpit.
-- The audit trigger raises for 'system:%' actors on human_reviewed rows, so the
-- actor is set session-wide up front.

select set_config('app.actor', 'migration:tag-dq-phase0', false);

-- B) exclusions BEFORE merges: merge_tag_concept consults this table.
insert into tag_relationship_exclusions (tag1_id, tag2_id, reason)
select least(a.id, b.id), greatest(a.id, b.id),
       'material tag vs adult fetish sense split - twin names are intentional (tag DQ phase 0, 2026-08-22)'
from (values
  ('mat-denim','denim'), ('mat-lace','lace'), ('mat-leather','leather'),
  ('mat-metal','metal'), ('mat-rubber','rubber'), ('mat-spandex','spandex')
) p(s1, s2)
join unified_tags a on a.slug = p.s1
join unified_tags b on b.slug = p.s2
on conflict (tag1_id, tag2_id) do nothing;

-- A) merge the unambiguous twins. Canonical is the natural (unprefixed /
-- accent-clean) slug; content is copied onto the canonical first where it is
-- empty so the merge loses nothing (merge_tag_concept moves links, not fields).
do $$
declare
  v_pairs text[][] := array[
    ['attila-horbiger', 'attila-h-rbiger'],   -- both Q85343
    ['charite',         'charit'],            -- both Q162684
    ['jannik-schumann', 'jannik-sch-mann'],   -- both Q1682910
    ['ulrike-roseberg', 'ulrike-r-seberg'],   -- both Q2477443
    ['festival',        'occ-festival'],      -- both Q132241
    ['restaurant',      'restaurant-venue'],  -- both Q11707
    ['violence',        'news-violence'],     -- both Q98034423
    ['beach',           'occ-beach'],
    ['halloween',       'occ-halloween'],
    ['drag',            'occ-drag'],
    ['party',           'occ-party']
  ];
  v_pair text[];
  v_canon uuid;
  v_dup uuid;
begin
  foreach v_pair slice 1 in array v_pairs loop
    select id into v_canon from unified_tags
     where slug = v_pair[1] and status = 'active' and merged_into_id is null;
    select id into v_dup from unified_tags
     where slug = v_pair[2] and status = 'active' and merged_into_id is null;
    if v_canon is null or v_dup is null then
      raise notice 'tag twin merge: skipping % <- % (not both active)', v_pair[1], v_pair[2];
      continue;
    end if;

    update unified_tags c
       set description       = coalesce(nullif(c.description, ''), d.description),
           short_description = coalesce(nullif(c.short_description, ''), d.short_description),
           long_description  = coalesce(nullif(c.long_description, ''), d.long_description),
           wikidata_id       = coalesce(c.wikidata_id, d.wikidata_id),
           image_url         = coalesce(c.image_url, d.image_url),
           image_alt         = case when c.image_url is null then coalesce(d.image_alt, c.image_alt) else c.image_alt end,
           image_source      = case when c.image_url is null then coalesce(d.image_source, c.image_source) else c.image_source end,
           image_license     = case when c.image_url is null then coalesce(d.image_license, c.image_license) else c.image_license end,
           image_attribution = case when c.image_url is null then coalesce(d.image_attribution, c.image_attribution) else c.image_attribution end
      from unified_tags d
     where c.id = v_canon and d.id = v_dup;

    begin
      perform merge_tag_concept(v_canon, v_dup, 'migration:tag-dq-phase0', 'twin-name-cleanup');
    exception when others then
      raise warning 'tag twin merge failed for % <- %: %', v_pair[1], v_pair[2], sqlerrm;
    end;
  end loop;
end $$;

-- Close any pre-existing pending review rows the merges just settled.
update tag_merge_review r
   set status = 'auto_merged', decided_at = now(), decided_by = 'migration:tag-dq-phase0'
 where r.status = 'pending'
   and (
     (select merged_into_id from unified_tags where id = r.duplicate_id) = r.canonical_id
     or (select merged_into_id from unified_tags where id = r.canonical_id) = r.duplicate_id
   );

-- C) queue the ambiguous pairs for the human cockpit on /admin/tags.
insert into tag_merge_review (canonical_id, duplicate_id, similarity, lexical_variant, status, reason)
select a.id, b.id, 1.0, p.lex, 'pending', p.why
from (values
  ('occ-pride',      'news-pride',      false, 'same display name "Pride" but different QIDs (Q3071551 vs Q10852104) - decide one concept or rename'),
  ('gym',            'occ-gym',         false, 'same display name "Gym"; canonical is human_reviewed + is_sensitive, twin carries 544 links - flag divergence needs a human'),
  ('mavie-horbiger', 'mavie-h-rbiger',  true,  'accent-fold person twin; QID only on the accented slug - person merges need identical QIDs, confirm same person')
) p(s1, s2, lex, why)
join unified_tags a on a.slug = p.s1 and a.status = 'active' and a.merged_into_id is null
join unified_tags b on b.slug = p.s2 and b.status = 'active' and b.merged_into_id is null
where not exists (
  select 1 from tag_merge_review r
   where least(r.canonical_id, r.duplicate_id) = least(a.id, b.id)
     and greatest(r.canonical_id, r.duplicate_id) = greatest(a.id, b.id)
);
