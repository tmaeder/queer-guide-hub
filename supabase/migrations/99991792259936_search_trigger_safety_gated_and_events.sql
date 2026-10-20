-- Two changes to the search_documents_sync triggers, one a SAFETY FIX to a
-- defect shipped by 99991791966722, one the next table in the same class.
--
-- ===========================================================================
-- 1. THE ORGANIZATIONS TRIGGER STOPPED PROPAGATING safety_gated. FIXED HERE.
-- ===========================================================================
--
-- 99991791966722 replaced the bare organizations search trigger with a
-- value-scoped one (UPDATE OF <20 cols> WHEN <20 comparisons>), so a write that
-- changes nothing the search document reads enqueues nothing. Its column list
-- was DERIVED from search_documents_index_organizations' `o.<col>` references,
-- and its postcondition P3 asserted "every column the indexer reads is
-- compared". Both were correct about the indexer, and that is the defect:
-- **the indexer is not the only reader of the entity on a search write.**
--
-- search_documents carries its own safety_gated column, kept in sync by
-- trg_search_documents_safety_gated -> set_search_document_safety_gated(),
-- which re-reads the ENTITY's safety_gated every time a search row is written.
-- So search_documents.safety_gated is refreshed only when a reindex happens.
-- recompute_safety_gated_for_country() -- fired when a country's
-- lgbti_criminalization changes, re-run nightly by the ILGA cron -- updates
-- organizations.safety_gated and NOTHING ELSE on the row, and never touches
-- search_documents. With safety_gated absent from the WHEN clause:
--
--   country starts criminalizing
--   -> organizations.safety_gated false -> true      (recompute writes it)
--   -> value-scoped trigger compares 20 columns, none is safety_gated
--   -> no reindex enqueued
--   -> search_documents.safety_gated stays FALSE
--   -> the organization stays visible in ANONYMOUS search
--
-- That is the outing exposure the safety layer exists to prevent. Under the
-- old bare trigger it could not happen, because any UPDATE reindexed.
--
-- MEASURED ARMED, NOT FIRED: on 2026-10-17, across 6,257 organization, 3,336
-- event and 94,754 venue search documents, the number whose safety_gated
-- disagrees with the entity's is 0. No country's criminalization status
-- changed between the defect's merge (2026-10-14) and this fix, so the hole
-- never opened. It would have opened on the next ILGA change.
--
-- WHY THE GUARD MISSED IT, AND THE GUARD THAT REPLACES IT. P3 enumerated one
-- reader. The new postcondition P1 enumerates the SECOND reader instead of
-- hardcoding a column: it reads the table list out of
-- set_search_document_safety_gated() itself, and for every one of those tables
-- that has a VALUE-SCOPED search trigger, asserts the WHEN clause compares
-- safety_gated. A bare trigger needs nothing (it fires on every write), so the
-- check covers exactly the triggers that can drop the signal -- today
-- organizations and events, and any table scoped later, automatically.
--
-- marketplace_listings is value-scoped too and carries no safety_gated
-- comparison, CORRECTLY: set_search_document_safety_gated() does not mirror
-- marketplace, so its search rows are never gated. P1 derives that rather than
-- exempting it by name.
--
-- ===========================================================================
-- 2. events: THE NEXT TABLE, AND THE ONLY ONE LEFT WORTH DOING.
-- ===========================================================================
--
-- 18 UPDATE-firing search_documents_sync triggers exist; after
-- 99991791966722 and a later marketplace change, 2 compare values. The other
-- 16 were NOT swept, because sweeping would size the work from a count.
-- Measured write rate per table (pg_stat_user_tables over a 10h window):
--
--   organizations         180,632/day   value-scoped (99991791966722)
--   marketplace_listings  153,997/day   value-scoped
--   events                 36,935/day   BARE            <- this file
--   content_embeddings     27,023/day   UPDATE OF only (the embeddings drain)
--   news_articles           6,979/day   BARE
--   everything else         0 - 378/day
--
-- The two biggest writers were already fixed. events is the one remaining
-- high-volume bare trigger. Its writes are dominated by columns the search
-- document never reads -- last_verified_at heartbeats (6,955 distinct events
-- touched in 24h; excluded from content_revisions, so invisible to a
-- revision-based sample), field_provenance, enrichment_status, postal_code,
-- venue_id, logo_fetched_at -- and under a bare trigger every one enqueues a
-- reindex. The other 14 tables are left alone: 0-378 writes/day buys nothing
-- measurable and each swap takes ACCESS EXCLUSIVE on a live table.
--
-- The column list is DERIVED, not chosen: search_documents_index_events reads
-- 29 columns besides id through the alias `e` (44 references, one table
-- mention -- the derivation is sound), plus safety_gated for the reason in
-- part 1. country_id/city_id are deliberately NOT listed: the indexer reads
-- the `city`/`country` TEXT columns, and a country_id change that flips
-- safety_gated is caught by safety_gated itself.
--
-- ===========================================================================
-- MECHANICS (unchanged from 99991791966722, and why)
-- ===========================================================================
--
-- * Split into _ins / _del (unconditional -- a WHEN cannot reference OLD on
--   INSERT or NEW on DELETE) and _upd (UPDATE OF + WHEN). UPDATE OF alone is
--   NOT enough: it fires on the columns named in the STATEMENT, not on what
--   changed, so a writer that names a column in its SET on every row defeats it.
-- * Each swap retries under a 2s lock_timeout instead of waiting or failing.
--   DROP TRIGGER takes ACCESS EXCLUSIVE; search_reindex_drain holds a read lock
--   for most of every minute, and a QUEUED exclusive lock blocks every new
--   reader behind it, so an unbounded wait stalls the table site-wide while a
--   bare lock_timeout turns a busy minute into a repo-wide db push abort.
-- * Only the organizations _upd trigger is recreated; its _ins/_del are
--   untouched.

do $swap$
declare
  v_attempt int := 0;
  v_max     int := 20;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      set local lock_timeout = '2s';

      -- 1. organizations: recreate _upd with safety_gated added.
      drop trigger if exists trg_search_documents_organization_upd on public.organizations;
      create trigger trg_search_documents_organization_upd
        after update of
          name, editorial_hook, description, website_domain, roles, tags,
          latitude, longitude, primary_venue_id, trust_score, is_defunct,
          completeness_score, slug, logo_url, cover_image_url,
          city_id, country_id, status, duplicate_of_id, field_provenance,
          safety_gated
        on public.organizations
        for each row
        when (
             old.name               is distinct from new.name
          or old.editorial_hook     is distinct from new.editorial_hook
          or old.description        is distinct from new.description
          or old.website_domain     is distinct from new.website_domain
          or old.roles              is distinct from new.roles
          or old.tags               is distinct from new.tags
          or old.latitude           is distinct from new.latitude
          or old.longitude          is distinct from new.longitude
          or old.primary_venue_id   is distinct from new.primary_venue_id
          or old.trust_score        is distinct from new.trust_score
          or old.is_defunct         is distinct from new.is_defunct
          or old.completeness_score is distinct from new.completeness_score
          or old.slug               is distinct from new.slug
          or old.logo_url           is distinct from new.logo_url
          or old.cover_image_url    is distinct from new.cover_image_url
          or old.city_id            is distinct from new.city_id
          or old.country_id         is distinct from new.country_id
          or old.status             is distinct from new.status
          or old.duplicate_of_id    is distinct from new.duplicate_of_id
          or old.field_provenance   is distinct from new.field_provenance
          or old.safety_gated       is distinct from new.safety_gated
        )
        execute function search_documents_sync('organization');

      -- 2. events: replace the bare trigger with _ins / _del / _upd.
      drop trigger if exists trg_search_documents_event on public.events;
      drop trigger if exists trg_search_documents_event_ins on public.events;
      drop trigger if exists trg_search_documents_event_del on public.events;
      drop trigger if exists trg_search_documents_event_upd on public.events;
      create trigger trg_search_documents_event_ins
        after insert on public.events
        for each row execute function search_documents_sync('event');
      create trigger trg_search_documents_event_del
        after delete on public.events
        for each row execute function search_documents_sync('event');
      create trigger trg_search_documents_event_upd
        after update of
          accessibility_attributes, city, content_language, country,
          description, description_i18n, duplicate_of_id, end_date,
          event_type, images, is_featured, is_free, latitude,
          liveness_status, logo_url, longitude, price_max, price_min,
          quality_score, seo_indexable, slug, start_date, status, tags,
          target_groups, title, title_i18n, trust_score, venue_name,
          safety_gated
        on public.events
        for each row
        when (
             old.accessibility_attributes is distinct from new.accessibility_attributes
          or old.city                     is distinct from new.city
          or old.content_language         is distinct from new.content_language
          or old.country                  is distinct from new.country
          or old.description              is distinct from new.description
          or old.description_i18n         is distinct from new.description_i18n
          or old.duplicate_of_id          is distinct from new.duplicate_of_id
          or old.end_date                 is distinct from new.end_date
          or old.event_type               is distinct from new.event_type
          or old.images                   is distinct from new.images
          or old.is_featured              is distinct from new.is_featured
          or old.is_free                  is distinct from new.is_free
          or old.latitude                 is distinct from new.latitude
          or old.liveness_status          is distinct from new.liveness_status
          or old.logo_url                 is distinct from new.logo_url
          or old.longitude                is distinct from new.longitude
          or old.price_max                is distinct from new.price_max
          or old.price_min                is distinct from new.price_min
          or old.quality_score            is distinct from new.quality_score
          or old.seo_indexable            is distinct from new.seo_indexable
          or old.slug                     is distinct from new.slug
          or old.start_date               is distinct from new.start_date
          or old.status                   is distinct from new.status
          or old.tags                     is distinct from new.tags
          or old.target_groups            is distinct from new.target_groups
          or old.title                    is distinct from new.title
          or old.title_i18n               is distinct from new.title_i18n
          or old.trust_score              is distinct from new.trust_score
          or old.venue_name               is distinct from new.venue_name
          or old.safety_gated             is distinct from new.safety_gated
        )
        execute function search_documents_sync('event');

      raise notice 'search triggers swapped on attempt %', v_attempt;
      exit;
    exception when lock_not_available then
      if v_attempt >= v_max then
        raise exception 'could not take ACCESS EXCLUSIVE on organizations/events in % attempts — search_reindex_drain is holding a read lock for most of every minute. Re-run the deploy; it succeeds as soon as a drain run finishes early.', v_max;
      end if;
      perform pg_sleep(2);
    end;
  end loop;
end
$swap$;

do $verify$
declare
  v_tbl     text;
  v_def     text;
  v_missing text[];
  v_col     text;
  v_n       int;
  v_mirror  text[];
begin
  -- P1 (THE SAFETY INVARIANT). Every table whose safety_gated is mirrored onto
  -- search_documents, and which has a VALUE-SCOPED search trigger, must compare
  -- safety_gated in that trigger's WHEN. The table list is read out of
  -- set_search_document_safety_gated() itself so a table added there is
  -- covered with no change here. A bare trigger is exempt by construction.
  select array_agg(distinct m[1]) into v_mirror
    from (select pg_get_functiondef(p.oid) as def
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'set_search_document_safety_gated') d,
         regexp_matches(d.def, 'from\s+public\.([a-z_]+)', 'gi') m;

  -- P1b: a mirror list that comes back empty proves nothing -- every table
  -- would vacuously pass. Measured today the function names 6 tables.
  if coalesce(cardinality(v_mirror), 0) < 5 then
    raise exception 'P1b failed: set_search_document_safety_gated() yielded only % tables — the safety check below would pass vacuously', coalesce(cardinality(v_mirror), 0);
  end if;

  v_missing := '{}';
  foreach v_tbl in array v_mirror loop
    for v_def in
      select pg_get_triggerdef(t.oid)
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = v_tbl
         and c.relnamespace = 'public'::regnamespace
         and not t.tgisinternal
         and t.tgtype::int & 16 > 0                       -- fires on UPDATE
         and pg_get_triggerdef(t.oid) ilike '%search_documents_sync%'
         and t.tgqual is not null                        -- value-scoped only
    loop
      if position('new.safety_gated' in v_def) = 0 then
        v_missing := v_missing || v_tbl;
      end if;
    end loop;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P1 failed: value-scoped search trigger(s) on % do not compare safety_gated — a criminalization change would leave search_documents.safety_gated stale and the row visible to anonymous search', v_missing;
  end if;

  -- P2. events: three enabled triggers, and the bare one is gone.
  select count(*) into v_n
    from pg_trigger t
   where t.tgrelid = 'public.events'::regclass
     and not t.tgisinternal
     and t.tgname in ('trg_search_documents_event_ins',
                      'trg_search_documents_event_del',
                      'trg_search_documents_event_upd')
     and t.tgenabled <> 'D';
  if v_n <> 3 then
    raise exception 'P2 failed: expected 3 enabled event search triggers, found %', v_n;
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'public.events'::regclass
                and not t.tgisinternal
                and t.tgname = 'trg_search_documents_event') then
    raise exception 'P2 failed: the unscoped trg_search_documents_event still exists';
  end if;

  -- P3. events coverage: every column search_documents_index_events reads is
  -- compared. Derived from the indexer, not restated.
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.events'::regclass
     and t.tgname = 'trg_search_documents_event_upd';
  v_missing := '{}';
  for v_col in
    select distinct lower(substring(m[1] from 3))
      from (select pg_get_functiondef(p.oid) as def
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname = 'search_documents_index_events') d,
           regexp_matches(d.def, '\me\.[a-z_]+', 'g') m
     where lower(substring(m[1] from 3)) <> 'id'
  loop
    if position('new.' || v_col in v_def) = 0 then
      v_missing := v_missing || v_col;
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P3 failed: trg_search_documents_event_upd does not compare %, which search_documents_index_events reads', v_missing;
  end if;

  -- P3b: the coverage loop above is vacuous if the indexer yielded nothing.
  select count(*) into v_n
    from (select pg_get_functiondef(p.oid) as def
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'search_documents_index_events') d,
         regexp_matches(d.def, '\me\.[a-z_]+', 'g') m;
  if v_n < 30 then
    raise exception 'P3b failed: only % e.<column> references found in the events indexer — the coverage check proved nothing', v_n;
  end if;

  -- P4. Both value-scoped _upd triggers really compare values and are not
  -- short-circuited.
  foreach v_tbl in array array['organizations', 'events'] loop
    select pg_get_triggerdef(t.oid) into v_def
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = v_tbl
       and c.relnamespace = 'public'::regnamespace
       and t.tgname in ('trg_search_documents_organization_upd',
                        'trg_search_documents_event_upd');
    if v_def is null or position(' WHEN ' in v_def) = 0 then
      raise exception 'P4 failed: the % UPDATE search trigger has no WHEN clause', v_tbl;
    end if;
    if position('IS DISTINCT FROM' in upper(v_def)) = 0 then
      raise exception 'P4 failed: the % WHEN clause does not compare old to new', v_tbl;
    end if;
    if upper(v_def) ~ '\mTRUE\M' or upper(v_def) ~ '\mFALSE\M' then
      raise exception 'P4 failed: the % WHEN clause contains a bare TRUE/FALSE and fires on every write', v_tbl;
    end if;
  end loop;

  -- P5. INSERT/DELETE triggers stay unconditional.
  if exists (
    select 1 from pg_trigger t
     where t.tgname in ('trg_search_documents_event_ins',
                        'trg_search_documents_event_del',
                        'trg_search_documents_organization_ins',
                        'trg_search_documents_organization_del')
       and position(' WHEN ' in pg_get_triggerdef(t.oid)) > 0
  ) then
    raise exception 'P5 failed: an INSERT/DELETE search trigger carries a WHEN clause';
  end if;
end
$verify$;
