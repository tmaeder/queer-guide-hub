-- Four deterministic language sentinels on tag_hygiene_stats().
--
-- Every one is mechanically checkable and cannot false-positive a correct tag.
-- Deliberately NO LLM verdict anywhere: the judge built to assess tag prose was
-- measured at ~19% precision and retracted 16 definitions of which 13 were
-- CORRECT (outing, deadnaming, soft-limits, pillow-princess), all at high
-- self-reported confidence. It is disabled by decision, and tag_prose_apply lost
-- its retract branch at the DB layer so it cannot be re-enabled by accident.
-- A self-reported confidence score cannot gate a write; a regex over a slug can.
--
-- The body below is the live definition read from prod via pg_get_functiondef,
-- with four keys appended. It is restated in full rather than wrapped because
-- src/lib/__tests__/tagHygieneStats.test.ts text-scans the latest migration that
-- defines this function, so a thin wrapper delegating to a renamed core would
-- pass the scan while the keys it asserts lived in a different file.
--
-- ALL FOUR ARE ZERO AFTER THE MIGRATIONS IN THIS BRANCH, so they ship as hard
-- zero-invariants with baseline 0 rather than as ratcheted counters:
--   slug_diacritic_lossy  11 -> 0  (repaired by 20261203100000)
--   name_contains_hashtag  8 -> 0  (deprecated by 20261203100100)
--   non_latin_name         0       (already enforced by trg_tag_language_guard)
--   name_mojibake          0       (see the merged-row note below)
--
-- ORDERING IS LOAD-BEARING. check-tag-hygiene.mjs iterates the keys of the LIVE
-- prod response (scripts/check-tag-hygiene.mjs:50), so a new key is invisible
-- until this applies — the PR that adds it passes. But once applied, a key with
-- no baseline entry hard-fails as `missing`. The baseline entries therefore ship
-- in the SAME commit, and this migration must not land before the two repairs
-- above or the first post-merge CI run reds on 11 and 8.

CREATE OR REPLACE FUNCTION public.tag_hygiene_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  -- A short description shared by many tags is a bulk-import stamp, not a
  -- definition. See the header of 20261007163100.
  stamps as (
    select btrim(description) as d
      from unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and not public.is_marketplace_facet(slug, entity_kind)),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- The junction is the source of truth; this counts rows where it says one
    -- thing and the denormalised column says nothing. Zero after 20261007163100.
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    -- A bulk-import stamp published as a definition. Invisible to
    -- indexable_without_description, which only sees an EMPTY description.
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    -- ── 2026-08-29 glossary content-quality keys ─────────────────────────
    'alias_equals_name', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where lower(a.alias_name) = lower(t.name)),
    'alias_mojibake', (
      select count(*) from tag_aliases
       where position(chr(65533) in alias_name) > 0),
    'refusal_prose_active', (
      select count(*) from active a
       where lower(btrim(coalesce(a.short_description, ''))) = 'no information available'
          or btrim(coalesce(a.long_description, '')) ~* '^there is no information available'),
    'unreviewed_typed_alias', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where a.alias_type <> 'multilingual'
         and a.review_status = 'auto'
         and t.status = 'active'),
    'relations_pending_review', (
      select count(*) from tag_relations
       where review_status = 'pending'
          or (review_status = 'auto' and relation_type = 'related')),
    'prose_unreviewed', (
      select count(*) from active
       where description is not null and prose_reviewed_at is null),
    -- ── 2026-09-02 language sentinels ────────────────────────────────────
    -- A slug that lost a diacritic to a hyphen (Bühne -> b-hne), because a
    -- producer hand-slugged without transliterating and its slug beat both DB
    -- triggers.
    --
    -- The non-ASCII term is LOAD-BEARING and must never be dropped. Without it
    -- the predicate matches 115 active rows of which only 8 are defects: the
    -- other 106 are DELIBERATE namespace prefixes on ASCII names (mat-silicone
    -- = 4,643 uses, news-education, occ-pride, genre-horror, vibe-bold), and
    -- "repairing" those renames them and breaks thousands of links.
    --
    -- status <> 'merged' is equally load-bearing: a merged row keeps its own
    -- slug as its redirect trail and resolves via merged_into_id, so repairing
    -- caf -> cafe would break the historical /tags/caf URL. Ten rows are
    -- legitimately lossy for that reason and must not be counted.
    'slug_diacritic_lossy', (
      select count(*) from unified_tags
       where status <> 'merged'
         and name ~ '[^\x00-\x7F]'
         and slug is distinct from public.normalize_tag_slug(name)),
    -- U+FFFD in a tag NAME. Mirrors the existing alias_mojibake idiom.
    -- Excludes merged for the same reason as above: exactly one row carries
    -- this today, `M?Llerian`, and it is merged — a frozen historical artifact
    -- whose name is a redirect key, not rendered prose. Recorded here rather
    -- than silently scoped away.
    'name_mojibake', (
      select count(*) from unified_tags
       where status <> 'merged'
         and position(chr(65533) in name) > 0),
    -- A scraped hashtag concatenation published as vocabulary
    -- ("Pulse #Mordopfer #Hassverbrechen" was a tag NAME, and indexable).
    'name_contains_hashtag', (
      select count(*) from unified_tags
       where status = 'active' and name like '%#%'),
    -- Asserts trg_tag_language_guard still holds. It rejects Cyrillic/CJK/
    -- Arabic/Greek/Hebrew/Thai/Devanagari outright, which is deterministic and
    -- cannot false-positive. Non-zero means the trigger was dropped or bypassed
    -- by a writer that does not go through it.
    'non_latin_name', (
      select count(*) from unified_tags
       where name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]')
  ) into v;

  return v;
end;
$function$;
