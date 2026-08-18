-- ============================================================================
-- Adult performer profile links, phase 1 — recover the stranded Pornhub URLs
--
-- NOTE ON THE VERSION: this file sorts BELOW the current remote max
-- (20260904100000) deliberately. It was applied live via MCP `apply_migration`,
-- which stamps the version from its own CALL TIMESTAMP rather than from any
-- filename, so remote history holds exactly `20260815105230`. The filename
-- matches that stamp so `db push` finds it and SKIPS it (it matches by
-- version), and so the drift monitor sees a repo file for every remote
-- version. Renaming it "forward" would break both. `check-migration-versions`
-- exempts a version that is already in `schema_migrations`, which is why the
-- ordering rule does not fire here — but only when it can read remote history,
-- so that step needs SUPABASE_ACCESS_TOKEN. The body is idempotent regardless:
-- the `not (social_links ? 'pornhub')` guard makes a re-run a no-op.
--
-- `import-adult-models-csv` wrote each imported performer's Pornhub URL to
-- `personalities.fields->>'pornhub_profile'`. That key has exactly ONE writer
-- and ZERO readers anywhere in the repo: it is invisible to SocialCards,
-- normalizeSocialLinks, socialSameAs and backfill-social-links.mjs. Measured
-- before writing this: 1,682 rows carry it, every one of them `is_adult`, and
-- `social_links` is EMPTY across the entire 7,012-row adult cohort — so the
-- site renders no links at all for people whose links we already own.
--
-- This moves them to the canonical `social_links->>'pornhub'` storage.
--
-- Three things are load-bearing:
--
--  1. PURE SQL, never the JS canonicalizer. Every stored URL sits in the
--     `/pornstar/` namespace, and until the companion registry fix the
--     canonicalizer rebuilt every Pornhub link as `/model/<handle>`. Those are
--     DIFFERENT namespaces holding DIFFERENT people — measured live,
--     `/model/chris-allen` 301s to `/users/chris-allen` while
--     `/pornstar/chris-allen` is a separate, live pornstar page. Round-tripping
--     these 1,682 rows through `build()` would have silently repointed them at
--     strangers.
--
--  2. BATCHES OF 200. `trg_search_documents_personality` fires on every row
--     UPDATE and this DB is disk-constrained; a statement timeout is a full
--     rollback. Same cap `verify-personality-wikidata.mjs` documents.
--
--  3. `fields.pornhub_profile` IS LEFT IN PLACE. It is the rollback, and it
--     costs nothing to keep.
--
-- The URL guard admits `%` because 3 rows are percent-encoded apostrophes
-- (`.../pornstar/johnson-o%27grady`) — both spot-checked live and returning
-- 200. A `[a-z0-9._-]` charset would have silently dropped them.
-- ============================================================================

do $$
declare
  v_batch  uuid[];
  v_n      int;
  v_total  int := 0;
begin
  loop
    select array_agg(id) into v_batch
    from (
      select id
      from public.personalities
      where is_adult                                   -- never write an adult
                                                       -- link onto a non-adult row
        and duplicate_of_id is null                    -- merged-away rows are dead
        and jsonb_typeof(fields) = 'object'            -- `fields` is '[]' on most rows
        and fields ? 'pornhub_profile'
        and not (coalesce(social_links, '{}'::jsonb) ? 'pornhub')
        and (fields ->> 'pornhub_profile') ~*
            '^https?://(www\.)?pornhub\.com/(pornstar|model|users)/[a-z0-9._%-]{2,50}/?$'
      limit 200
    ) s;

    exit when v_batch is null;

    update public.personalities p
       set social_links = coalesce(p.social_links, '{}'::jsonb)
                          || jsonb_build_object('pornhub', p.fields ->> 'pornhub_profile'),
           -- jsonb_set only creates the LAST path element, so the
           -- `social_links` container has to be materialised first.
           field_provenance = jsonb_set(
             coalesce(p.field_provenance, '{}'::jsonb)
               || jsonb_build_object(
                    'social_links',
                    coalesce(p.field_provenance -> 'social_links', '{}'::jsonb)),
             '{social_links,pornhub}',
             jsonb_build_object(
               'source', 'csv-import',
               'confidence', 1.0,
               'at', now()),
             true),
           updated_at = now()
     where p.id = any(v_batch);

    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  raise notice 'personality_adult_links_backfill: linked % personalities to pornhub', v_total;
end $$;
