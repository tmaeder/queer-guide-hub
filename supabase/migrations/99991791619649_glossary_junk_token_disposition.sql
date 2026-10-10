-- Twenty junk tokens leave the glossary; `Over 30` stays and changes kind.
--
-- `/tags` listed locale codes, filter-UI labels and bare letters as glossary
-- terms. The default view is `kind=concept` sorted by usage DESC, and usage
-- counts the ingest corpus rather than the entry, so `All` — no definition, no
-- summary, 2,643 assignments — sat at position 15, above most of the real
-- vocabulary.
--
-- THE COHORT, and how each row was decided (read, not pattern-matched):
--
--   all, other      filter-UI labels minted as concepts. `All` is a Shopify
--                   variant value and an event facet; neither is a topic.
--   no              129 events carry the literal string "no". Also NO/Norway.
--   us uk gb nz es  ISO locale codes scraped off venue country fields and news
--   it de cz tw     source locales. Zero definitions. The country is already
--   lu ng mk mu pe  structured on `venues.country_id`, so nothing is lost.
--   a, r, b         bare letters whose prose is about the ALPHABET — `A` is
--                   Q9659, `R` Q9852, `B` Q9705 — filed under Identity and
--                   Sex & Kink, which is a namesake chimera, not vocabulary.
--
-- THE CASE OF A TWO-LETTER NAME IS THE DISCRIMINATOR AND IT IS MEASURED.
-- `normalize_tag_name`'s all-uppercase rung preserves a genuine acronym, so a
-- real one stays `TV` (662 uses, Media & Entertainment) or `DJ` (52, Events);
-- a locale code that arrived lowercase was title-cased into `Gb`. `TV` and `DJ`
-- are therefore NOT in the cohort and the verify block asserts they survive.
--
-- DELIBERATELY NOT TOUCHED, each read before being spared:
--   369, 469        real terms with real definitions (group extensions of 69),
--                   correctly filed Positions/concept. A bare number is not a
--                   junk signal: `80s-Themed`, `24-Hour`, `2C-B`, `3-MMC` and
--                   `5-Alpha Reductase Deficiency` are all real.
--   size-l/m/s/xl   marketplace variant facets at ~20,000 uses each, kind
--                   `attribute`, already outside the glossary default view.
--                   `L`, `M` and `S` ARE single letters — which is exactly why
--                   the counter in 99991791619654 excludes `attribute`.
--   LGBTIQ+,        real vocabulary that merely lacks prose. Absence of a
--   Activist, TV    definition is a writing backlog, not junk; the ranking
--                   change in src/lib/tags/tagsIndexState.ts handles those.
--
-- DEPRECATED, NOT DELETED — the house pattern of 81000101100000. A hard DELETE
-- on `unified_tags` is unprecedented and irreversible; `restore_deprecated_tag`
-- undoes this. Deprecation is also what removes the row from every surface:
-- `/tags/:slug`, the edge SSR branch and the slug-redirect resolver all filter
-- `status = 'active'`, so `/tags/all` becomes a clean 404 in one hop.
--
-- `deprecated_at` IS LOAD-BEARING, not bookkeeping. `search_documents_index_tags`
-- keys on `(merged_into_id, deprecated_at)` and NOT on `status`, so a row left
-- with a null `deprecated_at` stays searchable while rendering nothing.
--
-- THE ASSIGNMENTS AND THE FREE-TEXT STRINGS GO TOO, in all THREE arrays.
-- `tag_hygiene_stats().assignment_to_non_active_tag` is a hard zero-invariant,
-- so deprecating alone would red `Critical data-quality gates` on every open
-- PR. And a deprecated tag whose string survives in `venues.tags` is still a
-- rendered chip and still a live search facet. Measured: events 140 (no 129,
-- all 11), venues 229, news 199 rows.
--   `venues` has NO tag normalizer trigger, so the filtered array is what
--   lands. `news_articles` has one (`trg_normalize_news_tags`), and it is
--   idempotent on these rows — measured, 0 of 199 would change beyond the
--   removal, so there is no collateral loss. `events` has
--   `normalize_event_taxonomy`, which never touches `tags` (81000101100000
--   already relied on this).
--
-- DEPRECATION IS ALSO THE PRODUCER SEAL for the two ASSIGN paths, which are
-- live — `Uk` was assigned 2026-10-09, `It` and `Lu` 2026-10-08. Both read only
-- active tags: `run_event_tag_link` builds its key map `where u.status =
-- 'active'` and `marketplace-variant-backfill` filters `.eq('status','active')`.
-- Once the row is deprecated the string stops resolving. The MINT path is
-- sealed separately, in `_shared/tag-name-quality.ts` + pipeline-validate.
--
-- SOFT ON PRECONDITIONS: a row a concurrent session already deprecated is a
-- NOTICE, never an abort — `db push` stops the whole repo on one failing file.

do $$
declare
  v_ids uuid[];
  n_assign int;
  n_rel int;
  n_cat int;
  n_events int;
  n_venues int;
  n_news int;
  n_tags int;
  v_slugs constant text[] := array[
    'all','other','no',
    'us','uk','gb','nz','es','it','de','cz','tw','lu','ng','mk','mu','pe',
    'a','r','b'
  ];
begin
  perform set_config('app.actor', 'migration:99991791619649_glossary_junk_token_disposition', true);

  select array_agg(id) into v_ids from unified_tags where slug = any(v_slugs);

  if v_ids is null then
    raise notice 'none of the 20 junk-token slugs are present; nothing to do';
    return;
  end if;

  delete from unified_tag_assignments where tag_id = any(v_ids);
  get diagnostics n_assign = row_count;

  delete from tag_relations where source_tag_id = any(v_ids) or target_tag_id = any(v_ids);
  get diagnostics n_rel = row_count;

  delete from tag_category_assignments where tag_id = any(v_ids);
  get diagnostics n_cat = row_count;

  -- The three free-text arrays. Matched on the whole lower-cased token, never
  -- a substring: a `like '%us%'` here would strip "trust" and "museum".
  update events
     set tags = (select coalesce(array_agg(x order by ord), '{}')
                   from unnest(tags) with ordinality u(x, ord)
                  where lower(btrim(x)) <> all(v_slugs))
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  get diagnostics n_events = row_count;

  update venues
     set tags = (select coalesce(array_agg(x order by ord), '{}')
                   from unnest(tags) with ordinality u(x, ord)
                  where lower(btrim(x)) <> all(v_slugs))
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  get diagnostics n_venues = row_count;

  update news_articles
     set tags = (select coalesce(array_agg(x order by ord), '{}')
                   from unnest(tags) with ordinality u(x, ord)
                  where lower(btrim(x)) <> all(v_slugs))
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  get diagnostics n_news = row_count;

  update unified_tags
     set status             = 'deprecated',
         seo_indexable      = false,
         usage_count        = 0,
         deprecated_at      = now(),
         deprecation_reason = 'scrape artifact: locale code / filter label / bare letter, not vocabulary (99991791619649)'
   where id = any(v_ids)
     and status is distinct from 'deprecated';
  get diagnostics n_tags = row_count;

  raise notice 'junk tokens: assignments=% relations=% categories=% events=% venues=% news=% deprecated=%',
    n_assign, n_rel, n_cat, n_events, n_venues, n_news, n_tags;
end $$;

-- `Over 30` is NOT junk and keeps its name. Its slug `u30` is `Ü30` with the
-- umlaut lost (the `slug_diacritic_lossy` class) — German party shorthand for
-- "über 30", over thirty. The source data settles it rather than a guess: of
-- the 23 events it is attached to, one is "Les*be'tween - Lesben ab 30",
-- lesbians FROM thirty up. So the row is a legitimate age facet that was filed
-- as a glossary concept; `descriptor` moves it from the index's "Terms" tab to
-- "Labels" with no deprecation and no data loss.
--
-- The category is deliberately left alone. `Culture & Community` is a poor fit
-- for an age facet, but refiling is an editorial decision and this migration is
-- a declutter. Changing `entity_kind` fires `enforce_tag_facet_page_gate`,
-- which only ever sets `seo_indexable := false` on a marketplace facet and
-- never raises; this row is already not indexable, so the gate is a no-op.
do $$
declare n int;
begin
  perform set_config('app.actor', 'migration:99991791619649_glossary_junk_token_disposition', true);

  update unified_tags
     set entity_kind = 'descriptor'
   where slug = 'u30'
     and status = 'active'
     and entity_kind::text = 'concept';
  get diagnostics n = row_count;

  if n = 0 then
    raise notice 'u30 is not an active concept (already refiled, or gone); nothing to do';
  end if;
end $$;

-- Hard on postconditions. Each check counts the REACHED state positively and
-- asserts its own expected total, because counting rows in the BAD state
-- returns 0 for a slug that has vanished from the corpus entirely — which the
-- soft preconditions above now permit.
do $verify$
declare
  v_bad int;
  v_slugs constant text[] := array[
    'all','other','no',
    'us','uk','gb','nz','es','it','de','cz','tw','lu','ng','mk','mu','pe',
    'a','r','b'
  ];
begin
  -- P1. All twenty reached the deprecated, deindexed, dated state.
  select count(*) into v_bad
    from unified_tags
   where slug = any(v_slugs)
     and status = 'deprecated'
     and not seo_indexable
     and deprecated_at is not null;
  if v_bad <> 20 then
    raise exception '99991791619649 P1: % of 20 junk tokens reached the deprecated state', v_bad;
  end if;

  -- P2. No assignment, relation or category row survives on any of them.
  select count(*) into v_bad
    from unified_tag_assignments a join unified_tags u on u.id = a.tag_id
   where u.slug = any(v_slugs);
  if v_bad <> 0 then
    raise exception '99991791619649 P2: % assignments survive', v_bad;
  end if;

  select count(*) into v_bad
    from tag_relations r join unified_tags u on u.id in (r.source_tag_id, r.target_tag_id)
   where u.slug = any(v_slugs);
  if v_bad <> 0 then
    raise exception '99991791619649 P2: % relations survive', v_bad;
  end if;

  select count(*) into v_bad
    from tag_category_assignments c join unified_tags u on u.id = c.tag_id
   where u.slug = any(v_slugs);
  if v_bad <> 0 then
    raise exception '99991791619649 P2: % category rows survive', v_bad;
  end if;

  -- P3. All three free-text arrays are clear. Asserted per table, so a patch
  -- that cleaned one and skipped another cannot pass on a combined zero.
  select count(*) into v_bad from events
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  if v_bad <> 0 then
    raise exception '99991791619649 P3: % events still carry a junk token string', v_bad;
  end if;

  select count(*) into v_bad from venues
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  if v_bad <> 0 then
    raise exception '99991791619649 P3: % venues still carry a junk token string', v_bad;
  end if;

  select count(*) into v_bad from news_articles
   where exists (select 1 from unnest(tags) y where lower(btrim(y)) = any(v_slugs));
  if v_bad <> 0 then
    raise exception '99991791619649 P3: % news articles still carry a junk token string', v_bad;
  end if;

  -- P4. THE CONTROLS SURVIVE. "The twenty are gone" is equally satisfied by a
  -- sweep that took everything, so the rows this migration exists NOT to touch
  -- are asserted by name: the two real acronyms the case rule spares, the two
  -- real numeric terms, and one marketplace size facet.
  select count(*) into v_bad
    from unified_tags
   where slug in ('tv', 'dj', '369', '469', 'size-l')
     and status = 'active';
  if v_bad <> 5 then
    raise exception '99991791619649 P4: % of 5 spared controls are still active', v_bad;
  end if;

  -- The size facet keeps its assignments; it is the reason `attribute` is
  -- excluded from the counter rather than single letters being allowed.
  select count(*) into v_bad
    from unified_tag_assignments a join unified_tags u on u.id = a.tag_id
   where u.slug = 'size-l';
  if v_bad < 20000 then
    raise exception '99991791619649 P4: size-l has only % assignments; the sweep was too wide', v_bad;
  end if;

  -- P5. `Over 30` survived as a descriptor with its name intact.
  select count(*) into v_bad
    from unified_tags
   where slug = 'u30' and status = 'active'
     and entity_kind::text = 'descriptor' and name = 'Over 30';
  if v_bad <> 1 then
    raise exception '99991791619649 P5: u30 is not an active descriptor named "Over 30"';
  end if;
end $verify$;
