-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260904104115 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Marketplace facets are not glossary pages.
--
-- Measured on prod 2026-09-04: 94 active marketplace facets, 0 filed in any of
-- the three filing representations, 44 seo_indexable, 50 already deindexed
-- (49 stamped 'thin', 1 'system:trigger').
--
-- Being unfiled is NOT the defect. Every one is a marketplace attribute facet
-- and public.is_marketplace_facet() (20261018130000) already says so; the
-- 2026-08-29 taxonomy rebuild decided deliberately that marketplace-namespaced
-- tags are filed NOWHERE. The defect is that the decision was never carried
-- through to seo_indexable, so 44 publish a glossary page with no place in the
-- information architecture.
--
-- Full reasoning, the scope trap (a `^(mat|genre|vibe)-` pattern sees only 15
-- of the 44), and the per-row evidence for the 14 retractions are in the repo
-- copy of this migration.

-- 1. Repair three mis-stamped glossary rows FIRST. spandex/lace/denim carry no
-- marketplace prefix and are facets only by entity_kind='attribute', but they
-- are curated kink glossary entries with hand-written long_description bodies.
-- Ordering is load-bearing: after this they are not facets, so the steps below
-- cannot touch them.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:marketplace_facets_are_not_glossary_pages', true);

  update public.unified_tags
     set entity_kind = 'concept', updated_at = now()
   where slug in ('spandex', 'lace', 'denim')
     and status = 'active'
     and entity_kind = 'attribute';
  get diagnostics v = row_count;

  raise notice 'un-stamped % mis-classed glossary row(s) attribute -> concept', v;
  if v <> 3 then
    raise exception 'expected 3 mis-stamped glossary rows, found % - re-measure before deindexing', v;
  end if;
end $$;

-- 2. A marketplace facet is never indexable. Mirrors enforce_tag_thin_page_gate
-- (20261030100000): BEFORE trigger, mutates NEW only, only ever forces false.

create or replace function public.enforce_tag_facet_page_gate()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.seo_indexable is true
     and new.status = 'active'
     and new.merged_into_id is null
     and public.is_marketplace_facet(new.slug, new.entity_kind)
  then
    new.seo_indexable := false;
    new.seo_deindex_reason := 'facet';
  end if;
  return new;
end;
$fn$;

comment on function public.enforce_tag_facet_page_gate() is
  'Deindexes a marketplace attribute facet at write time. A facet belongs to no glossary category by decision (see is_marketplace_facet and the 2026-08-29 taxonomy rebuild), so it has no place in the glossary IA and must not publish /tags/:slug. Mirrors enforce_tag_thin_page_gate: BEFORE trigger, mutates NEW only, never writes another row. Makes tag_hygiene_stats().indexable_marketplace_facet a write-time invariant rather than a queue depth.';

drop trigger if exists trg_tag_facet_page_gate on public.unified_tags;

-- slug/entity_kind are in scope because they are the predicate's own inputs.
-- Name sorts BEFORE trg_tag_thin_page_gate, so a facet with no prose is stamped
-- 'facet' rather than the auto-reversible 'thin'.
create trigger trg_tag_facet_page_gate
  before insert or update of slug, entity_kind, seo_indexable, status, merged_into_id
  on public.unified_tags
  for each row execute function public.enforce_tag_facet_page_gate();

-- 3. The 44 indexable facets. Predicate, not a frozen id list; the bound is a
-- runaway guard, not an expected count.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:marketplace_facets_are_not_glossary_pages', true);

  update public.unified_tags
     set seo_indexable = false,
         seo_deindex_reason = 'facet',
         updated_at = now()
   where status = 'active'
     and merged_into_id is null
     and seo_indexable
     and public.is_marketplace_facet(slug, entity_kind);
  get diagnostics v = row_count;

  raise notice 'deindexed % marketplace facet page(s)', v;
  if v > 200 then
    raise exception 'facet deindex matched % rows, expected ~44 - refusing to mass-deindex', v;
  end if;
end $$;

-- 4. The 49 pre-existing deindexes are stamped 'thin', the one value
-- run_tag_thin_page_reindex() reverses on prose arrival. Re-stamp so the fix
-- does not depend on the trigger above still existing.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:marketplace_facets_are_not_glossary_pages', true);

  update public.unified_tags
     set seo_deindex_reason = 'facet', updated_at = now()
   where status = 'active'
     and merged_into_id is null
     and not seo_indexable
     and seo_deindex_reason = 'thin'
     and public.is_marketplace_facet(slug, entity_kind);
  get diagnostics v = row_count;

  raise notice 're-stamped % facet(s) from reversible thin -> facet', v;
end $$;

-- 5. Retract the 14 wrong-subject definitions, each read against its own stored
-- QID: occ-pride Q3071551 (the emotion, 2,179 uses), vibe-vintage Q1975981
-- (winemaking), vibe-colorful Q1075, genre-romance Q1189047 (the emotion),
-- genre-ya Q17156455 (the medical sense), color-navy Q4508 (a naval fleet),
-- color-gold Q897 / color-silver Q1090 (chemical elements), color-cream Q13228
-- (a dairy product), color-multicolor Q6934607 (a film process), size-m Q9933
-- (the 13th letter), size-3xl Q3321715 (a TV channel), size-queen (a kink term
-- on a size facet), fit-petite (a French surname). All are the pre-guard
-- tag-enrichment-sweep name-lookup defect.
--
-- Removal only, no replacements. The Wikidata identity goes in the same UPDATE
-- because tag_medical_codes_sync and the hierarchy sync rebuild WEEKLY from
-- wikidata_id: a wrong identifier regenerates wrong data forever, a null one
-- regenerates nothing.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:marketplace_facets_are_not_glossary_pages', true);

  update public.unified_tags
     set description = null,
         short_description = null,
         long_description = null,
         wikidata_id = null,
         wikipedia_url = null,
         seo_indexable = false,
         seo_deindex_reason = 'facet',
         updated_at = now()
   where status = 'active'
     and slug in ('occ-pride', 'vibe-vintage', 'vibe-colorful', 'genre-romance',
                  'genre-ya', 'color-navy', 'color-gold', 'color-silver',
                  'color-cream', 'color-multicolor', 'size-m', 'size-3xl',
                  'size-queen', 'fit-petite');
  get diagnostics v = row_count;

  raise notice 'retracted wrong-subject prose on % facet(s)', v;
  if v <> 14 then
    raise exception 'expected 14 wrong-subject rows, updated % - the slug set moved', v;
  end if;
end $$;

-- 6. The sentinel. Live definition (latest: 20261211120300) with ONE key
-- appended; restated in full because create or replace overwrites the whole
-- body and src/lib/__tests__/tagHygieneStats.test.ts text-scans the latest
-- migration defining this function.

create or replace function public.tag_hygiene_stats()
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
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
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
    'indexable_marketplace_facet', (
      select count(*) from active
       where seo_indexable
         and public.is_marketplace_facet(slug, entity_kind)),
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    'event_tag_pairs_unlinked', (
      with vocab as (
        select lower(u.name) as key, u.id as tag_id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.name) <> ''
        union
        select lower(u.slug), u.id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.slug) <> ''
      ), unambiguous as (
        select key, (array_agg(tag_id))[1] as tag_id
          from vocab group by key having count(distinct tag_id) = 1
      ), pairs as (
        select distinct e.id as entity_id, v.tag_id
          from events e
          cross join lateral unnest(e.tags) as t
          join unambiguous v on v.key = lower(btrim(t))
         where e.created_at < now() - interval '1 hour'
      )
      select count(*) from pairs p
       where not exists (
         select 1 from unified_tag_assignments a
          where a.entity_id = p.entity_id and a.tag_id = p.tag_id
            and a.entity_type = 'event')),
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
    'slug_diacritic_lossy', (
      select count(*) from unified_tags
       where status <> 'merged'
         and name ~ '[^\x00-\x7F]'
         and slug is distinct from public.normalize_tag_slug(name)),
    'name_mojibake', (
      select count(*) from unified_tags
       where status <> 'merged'
         and position(chr(65533) in name) > 0),
    'name_contains_hashtag', (
      select count(*) from unified_tags
       where status = 'active' and name like '%#%'),
    'non_latin_name', (
      select count(*) from unified_tags
       where name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]')
  ) into v;

  return v;
end;
$function$;

-- 7. Assertions. Fail rather than ship the state this exists to remove.

do $$
declare v_facet int; v_thin int;
begin
  select (public.tag_hygiene_stats()->>'indexable_marketplace_facet')::int into v_facet;
  if v_facet <> 0 then
    raise exception 'indexable_marketplace_facet is % after the gate, expected 0', v_facet;
  end if;

  select (public.tag_hygiene_stats()->>'indexable_without_description')::int into v_thin;
  if v_thin <> 0 then
    raise exception 'indexable_without_description is % after the retraction, expected 0', v_thin;
  end if;
end $$;

do $$
declare v int;
begin
  select count(*) into v
    from public.unified_tags
   where status = 'active'
     and slug in ('occ-pride', 'vibe-vintage', 'vibe-colorful', 'genre-romance',
                  'genre-ya', 'color-navy', 'color-gold', 'color-silver',
                  'color-cream', 'color-multicolor', 'size-m', 'size-3xl',
                  'size-queen', 'fit-petite')
     and (description is not null or short_description is not null
          or long_description is not null or wikidata_id is not null);
  if v > 0 then
    raise exception '% wrong-subject facet(s) still publish prose or a Wikidata identity', v;
  end if;
end $$;

-- The three curated glossary rows KEPT their pages and their bodies.
do $$
declare v int;
begin
  select count(*) into v
    from public.unified_tags
   where slug in ('spandex', 'lace', 'denim')
     and status = 'active'
     and seo_indexable
     and entity_kind = 'concept'
     and length(coalesce(long_description, '')) > 100;
  if v <> 3 then
    raise exception 'expected 3 curated glossary rows still indexable with their bodies, found %', v;
  end if;
end $$;

-- No facet left carrying an auto-reversible reason.
do $$
declare v int;
begin
  select count(*) into v
    from public.unified_tags
   where status = 'active' and merged_into_id is null
     and not seo_indexable
     and seo_deindex_reason = 'thin'
     and public.is_marketplace_facet(slug, entity_kind);
  if v > 0 then
    raise exception '% facet(s) still stamped thin - run_tag_thin_page_reindex would republish them', v;
  end if;
end $$;

-- The gate proves itself, using a row WITH prose so only this gate can fire.
do $$
declare v_id uuid; v_indexable boolean; v_reason text;
begin
  perform set_config('app.actor', 'migration:marketplace_facets_are_not_glossary_pages', true);

  insert into public.unified_tags (name, slug, status, description)
  values ('Mat Zz Facet Gate Probe', 'mat-zz-facet-gate-probe', 'active', 'Probe prose.')
  returning id into v_id;

  select seo_indexable, seo_deindex_reason into v_indexable, v_reason
    from public.unified_tags where id = v_id;
  if v_indexable is not false or v_reason <> 'facet' then
    raise exception 'gate did not fire on INSERT: seo_indexable=%, reason=%', v_indexable, v_reason;
  end if;

  update public.unified_tags set seo_indexable = true where id = v_id;
  select seo_indexable into v_indexable from public.unified_tags where id = v_id;
  if v_indexable is not false then
    raise exception 'gate did not fire on UPDATE OF seo_indexable';
  end if;

  -- A non-facet slug is NOT gated. Without this arm the probe passes on a
  -- trigger that deindexes the entire glossary.
  update public.unified_tags
     set slug = 'zz-facet-gate-probe-control', seo_indexable = true
   where id = v_id;
  select seo_indexable into v_indexable from public.unified_tags where id = v_id;
  if v_indexable is not true then
    raise exception 'gate fired on a NON-facet slug - it is deindexing the glossary';
  end if;

  delete from public.unified_tags where id = v_id;
end $$;;
