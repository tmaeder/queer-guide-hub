-- Marketplace facets are not glossary pages.
--
-- =============================================================================
-- What is wrong
-- =============================================================================
--
-- 15 active tags are `seo_indexable` and filed in NONE of the three filing
-- representations — `unified_tags.category` NULL, `unified_tags.category_id`
-- NULL, and zero `tag_category_assignments` rows. All three had to be checked,
-- because each reader surface reads a different one: `/tags/:slug` renders the
-- JUNCTION (TagDetail.tsx -> fetchTagWithCategories -> categories.find(is_primary)),
-- the search facet renders the denormalised `category` text, and `category_id`
-- is the lever that moves both.
--
--   mat-spandex 3237  vibe-vintage 2021  mat-lace 1168  genre-history 753
--   vibe-colorful 618  mat-glass 178  genre-romance 149  genre-memoir 59
--   mat-bamboo 55  genre-fiction 31  genre-poetry 28  genre-biography 7
--   genre-essays 0  genre-queer-theory 0  genre-ya 0
--
-- Being unfiled is NOT the defect. Every one of these is a marketplace
-- attribute facet, and `public.is_marketplace_facet()` (20261018130000) already
-- says so: the `mat-`/`vibe-`/`genre-` prefixes are three of its eleven
-- namespaces. The 2026-08-29 taxonomy rebuild decided deliberately that
-- marketplace-namespaced tags must be filed NOWHERE — 92 of 98 had been filed
-- by a bulk LLM run and, carrying the corpus's highest usage counts, OWNED the
-- head of 25 glossary stops. `tags_due_for_category`, `tags_without_category`
-- and `tag_hygiene_stats().uncategorized_active` all exclude them for that
-- reason.
--
-- The defect is that the same decision was never carried through to
-- `seo_indexable`. A tag that belongs to no category has no place in the
-- glossary information architecture, so it must not publish a glossary page —
-- and these do, at /tags/mat-spandex and fourteen others.
--
-- Four of them publish prose about the wrong subject entirely, because
-- `tag-enrichment-sweep` resolved identity by name lookup on the bare word
-- (`vintage`, `colorful`, `ya`, `romance`) — the namesake defect already sealed
-- by _shared/tag-wiki-guard.ts, which these rows predate:
--
--   vibe-vintage   Q?  "In winemaking, vintage is the process of picking grapes"
--   vibe-colorful  Q?  "Color is the visual perception produced by activation"
--   genre-romance  Q1189047 = the EMOTION, not the literary genre
--   genre-ya       Q?  "In medicine and the social sciences, a young adult is"
--
-- The other eleven publish prose that is generically correct — spandex really
-- is a synthetic fibre, a memoir really is that form — which is why only the
-- four are retracted below. Generic prose about a material is not wrong for a
-- material facet; it is merely in the wrong vocabulary, and that is fixed by
-- deindexing the page, not by rewriting the definition.
--
-- =============================================================================
-- Why a trigger and not a one-shot
-- =============================================================================
--
-- `unified_tags.seo_indexable` DEFAULTs to TRUE, so any producer that never
-- names the column publishes a page. That is the same root cause as the thin-page
-- sawtooth, and it gets the same answer: 20261030100000 made "thin => not
-- indexable" a write-time invariant with `enforce_tag_thin_page_gate`, and this
-- mirrors it exactly — BEFORE trigger, mutates NEW only, only ever forces false,
-- never writes another row, so there is no re-entrancy and no cross-row fan-out.
-- A one-shot alone would leave the next facet the marketplace taxonomy adds
-- publishing a glossary page again.
--
-- Deliberately scoped to FACETS, not to "uncategorized" in general. A new
-- glossary tag arrives uncategorized too, but only TEMPORARILY — the category
-- sweep files it within two hours. A facet is uncategorized PERMANENTLY, by
-- decision. Gating on uncategorized-in-general would deindex legitimate new
-- glossary tags and, under the default-deny rule on `seo_deindex_reason`, never
-- let them back: a one-way door on correct content. `is_marketplace_facet()` is
-- precisely the predicate that separates the two, which is why the gate is
-- written in terms of it rather than in terms of a category being absent.
--
-- `seo_deindex_reason = 'facet'` is therefore correct as a NON-reversible
-- reason. Only 'thin' is ever auto-reversed by `run_tag_thin_page_reindex()`,
-- and a facet never gains a category, so it must never come back.
--
-- `run_tag_thin_page_reindex` is deliberately NOT restated to add a facet term
-- to its re-index arm. Its arm requires `seo_deindex_reason = 'thin'`; the first
-- time it re-indexes a facet that has gained prose, this trigger forces the row
-- back to false and stamps 'facet', after which the row no longer matches that
-- arm. The churn is one wasted UPDATE per facet, once, and is self-limiting —
-- which does not justify restating a function that another branch may also be
-- restating.

-- ---------------------------------------------------------------------------
-- 1. A marketplace facet is never indexable.

create or replace function public.enforce_tag_facet_page_gate()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- Only ever forces false, and only stamps a reason when it is the one making
  -- the decision. Mirrors enforce_tag_thin_page_gate.
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

-- `slug` and `entity_kind` are in scope because they are the predicate's own
-- inputs — re-slugging a tag into a facet namespace, or stamping
-- entity_kind='attribute' on it, is the other way an indexable facet appears.
-- `status`/`merged_into_id` for the same reason as the thin gate: reviving a
-- deprecated tag re-mints its redirects, and a column-scoped trigger only fires
-- on the columns named in the UPDATE statement, never on what another BEFORE
-- trigger wrote.
--
-- Name sorts BEFORE trg_tag_thin_page_gate, and that ordering is load-bearing
-- in one direction only: BEFORE triggers fire in name order, so a thin facet is
-- stamped 'facet' rather than 'thin', and therefore is never auto-re-indexed
-- when prose arrives. Stamped 'thin' it would come back.
create trigger trg_tag_facet_page_gate
  before insert or update of slug, entity_kind, seo_indexable, status, merged_into_id
  on public.unified_tags
  for each row execute function public.enforce_tag_facet_page_gate();

-- ---------------------------------------------------------------------------
-- 2. The existing backlog.
--
-- Predicate, not a frozen id list: any other row in the same shape is the same
-- defect and gets the same treatment, and the set can only have grown between
-- this being written and CI applying it. The bound is a runaway guard, not an
-- expected count — the whole facet vocabulary is a fixed ~54-row seed plus the
-- three un-prefixed twins carrying the namespace in `entity_kind`, so anything
-- approaching 200 means `is_marketplace_facet` has been widened into the
-- glossary and this migration must not mass-deindex on that basis.
--
-- Declares an actor because much of the glossary is `human_reviewed` and
-- log_unified_tag_change() RAISEs when a `system:%` actor touches such a row.
-- It runs inside a DO block so set_config(..., true) is scoped to a real
-- transaction — `set local` at migration top level is silently discarded by
-- `supabase db push` (WARNING 25P01) and the actor would never be applied.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:20261218100000_marketplace_facets_are_not_glossary_pages', true);

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
    raise exception 'facet deindex matched % rows, expected ~15 — refusing to mass-deindex', v;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Retract the four wrong-subject definitions.
--
-- A frozen slug list here, unlike step 2, because "this prose is about the
-- wrong subject" is a hand-verified judgment on four specific rows and no
-- predicate expresses it. The eleven generic-sense rows are deliberately NOT
-- touched.
--
-- Retraction only ever REMOVES; no replacement prose is written. It nulls the
-- Wikidata identity in the same UPDATE for the reason `tag_prose_apply`'s
-- retract branch gives: `tag_medical_codes_sync` and the tag hierarchy sync
-- rebuild weekly FROM `wikidata_id`, so a plausible-but-wrong identifier
-- regenerates wrong data forever while a null one regenerates nothing. Prefer
-- NULL to a guess — this corpus has already published ICPC-2 A96 (death) on a
-- trans glossary entry that way.
--
-- One statement, not two, so the page can never be both empty and indexable
-- even momentarily (20261015093000). `seo_indexable` is already false from step
-- 2; it is restated here so this block is correct on its own.
--
-- NOTE for the concurrent duplicate-wikidata_id session: this NULLs the QID on
-- these four rows. They were excluded there as generic-sense twins and are not
-- being merged, so nulling only shrinks the groups it was measuring.

do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:20261218100000_marketplace_facets_are_not_glossary_pages', true);

  update public.unified_tags
     set description = null,
         short_description = null,
         long_description = null,
         wikidata_id = null,
         wikipedia_url = null,
         seo_indexable = false,
         seo_deindex_reason = 'facet',
         updated_at = now()
   where slug in ('vibe-vintage', 'vibe-colorful', 'genre-romance', 'genre-ya')
     and status = 'active';
  get diagnostics v = row_count;

  raise notice 'retracted wrong-subject prose on % facet(s)', v;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The sentinel.
--
-- The body below is the live definition (latest: 20261211120300) with ONE key
-- appended. It is restated in full rather than wrapped because
-- src/lib/__tests__/tagHygieneStats.test.ts text-scans the latest migration that
-- defines this function, so a thin wrapper delegating to a renamed core would
-- pass the scan while the keys it asserts lived in a different file.
--
-- `create or replace` overwrites the whole body, so two branches that each
-- restate this function do not conflict in git — the one that APPLIES last
-- silently wins the entire key set. Every pre-existing counter is carried
-- forward here deliberately, and that test fails rather than letting one vanish.
--
-- Why this is a HARD zero-invariant and not an advisory counter: the baseline's
-- own rule is to gate on a count only when a write-time invariant makes that
-- count structural. Step 1 is exactly that invariant, so this has no window to
-- land in — unlike `uncategorized_active`, which is a genuine queue depth
-- because nothing can assign a category at INSERT time.

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
    -- ── 2026-09-04 ───────────────────────────────────────────────────────
    -- A marketplace attribute facet publishing a glossary page. Filed in none
    -- of the three representations BY DECISION, so an indexable one is a page
    -- with no place in the information architecture.
    --
    -- Deliberately NOT written as "indexable and uncategorized": that reads
    -- non-zero every time the ingest lands a tag before the two-hourly category
    -- sweep files it, which is the sawtooth that made uncategorized_active
    -- advisory. is_marketplace_facet() is the term that separates permanently
    -- uncategorized from temporarily uncategorized, and only the first is a
    -- defect. Backed at write time by trg_tag_facet_page_gate, which is what
    -- makes this structural enough to be a hard gate.
    'indexable_marketplace_facet', (
      select count(*) from active
       where seo_indexable
         and public.is_marketplace_facet(slug, entity_kind)),
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
    -- Carried forward from 20261211110000 (PR #3323), NOT authored here.
    --
    -- THE sentinel for run_event_tag_link, and a true zero-invariant.
    -- `events_with_tags_unlinked` above cannot reach 0 — ~3,856 events carry only
    -- strings the ambiguity guard blocks by design — so it read "non-zero" for
    -- 1,106 consecutive runs while the linker was wedged. Pairs fix that: an
    -- unlinkable event contributes none.
    --
    -- Shape is load-bearing for the 8s PostgREST ceiling: resolving ambiguity with
    -- a correlated `not exists` over the resolved set measured 51.1 SECONDS; the
    -- `group by key having count(distinct tag_id) = 1` form below is 708 ms for the
    -- identical answer. The 1-hour grace period keeps a normal 10-minute cron lag
    -- from reding unrelated PRs.
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

-- ---------------------------------------------------------------------------
-- 5. Assertions. The migration fails rather than shipping the state it exists
-- to remove.

do $$
declare v_facet int; v_thin int;
begin
  select (public.tag_hygiene_stats()->>'indexable_marketplace_facet')::int into v_facet;
  if v_facet <> 0 then
    raise exception 'indexable_marketplace_facet is % after the gate, expected 0', v_facet;
  end if;

  -- Step 3 nulls prose on four rows. If any of them were still indexable the
  -- corpus would carry a blank page in the sitemap — the exact regression
  -- 20261015093000 exists to prevent — so assert the sibling invariant too.
  select (public.tag_hygiene_stats()->>'indexable_without_description')::int into v_thin;
  if v_thin <> 0 then
    raise exception 'indexable_without_description is % after the retraction, expected 0', v_thin;
  end if;
end $$;

-- Assert the retraction actually removed the claims, rather than silently
-- matching zero rows because a slug moved.
do $$
declare v int;
begin
  select count(*) into v
    from public.unified_tags
   where slug in ('vibe-vintage', 'vibe-colorful', 'genre-romance', 'genre-ya')
     and status = 'active'
     and (description is not null or short_description is not null
          or long_description is not null or wikidata_id is not null);
  if v > 0 then
    raise exception '% wrong-subject facet(s) still publish prose or a Wikidata identity', v;
  end if;
end $$;

-- The gate proves itself: a facet cannot be made indexable, and the proof uses
-- a row WITH prose so that only this gate can possibly be the one firing.
do $$
declare v_id uuid; v_indexable boolean; v_reason text;
begin
  perform set_config('app.actor', 'migration:20261218100000_marketplace_facets_are_not_glossary_pages', true);

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

  -- A non-facet slug is NOT gated by this trigger. Without this arm the probe
  -- passes on a trigger that deindexes the entire glossary.
  update public.unified_tags
     set slug = 'zz-facet-gate-probe-control', seo_indexable = true
   where id = v_id;
  select seo_indexable into v_indexable from public.unified_tags where id = v_id;
  if v_indexable is not true then
    raise exception 'gate fired on a NON-facet slug — it is deindexing the glossary';
  end if;

  delete from public.unified_tags where id = v_id;
end $$;
