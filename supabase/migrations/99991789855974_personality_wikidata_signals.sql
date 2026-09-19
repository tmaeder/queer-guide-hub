-- Nothing was watching whether a personality's identifier points at a person.
--
-- Two repairs landed on 2026-09-19 and left no sentinel between them:
--   99970101100100  84 PUBLIC rows whose wikidata_qid resolved to a non-human
--                   (Alaska the US state, Brandi Carlile's ALBUM, a genus of
--                   insects, "chemist" the occupation)
--   99991789833562  125 rows out of the adult-link queue, 50 non-human and 72 a
--                   DIFFERENT real named person (Jason Collins the NBA player,
--                   a NZ Māori language and gay rights advocate, a trade
--                   unionist), + 99991789840157 for the four whose biography
--                   came from the Wikipedia extract rather than the Wikidata
--                   description
--
-- `set_personhood_verdict` is a different question -- "is this ROW a person or a
-- misfiled organisation" -- and answers nothing about whether the IDENTIFIER on a
-- row that really is a person resolves to that person. Checked before writing
-- this: no function in the schema watches the latter.
--
-- WHAT SQL CAN AND CANNOT CHECK, which decides the whole shape. This runs in
-- Postgres and cannot call Wikidata, so it cannot re-derive P31 and cannot tell
-- you that a NEW identifier is wrong. What it can do is exactly what
-- `tag_wikidata_repair_regressions()` does one entity type over: watch for a
-- refuted identifier COMING BACK, and for a completed repair being undone. Every
-- key below is structural and derived from state the repairs already recorded.
--
--   qid_regressed          a live wikidata_qid equal to one this platform has
--                          already recorded as refuted for that same row.
--                          ZERO-INVARIANT. Means a producer is adopting
--                          name-resolved identities again -- check that
--                          `resolveByNameAndProfession()` is still what
--                          personality-refresh calls, and that its isHuman() and
--                          occupation-overlap arms are intact.
--   sentinel_lost          a row disposed wrong-entity whose wikidata_qid is no
--                          longer a SKIP_ sentinel. ZERO-INVARIANT. A NULL here
--                          is not neutral: personality-refresh re-resolves by
--                          name whenever the column IS NULL, so the row re-enters
--                          resolution forever instead of recording its decision.
--   retracted_text_back    a row whose retracted description has returned
--                          verbatim. ZERO-INVARIANT. The identifier coming back
--                          and the TEXT coming back are separate failures -- the
--                          tag work needed two sentinels for exactly this reason,
--                          because `suspension` kept serving an account-ban
--                          definition for ten days after its id was cleared.
--
-- REPORTED, NEVER GATED:
--   rows_with_qid          total personalities carrying a well-formed Q-id.
--   dispositioned          how many have been judged wrong so far.
--   unverified_reachable   public-or-indexable rows with a real identifier that
--                          no sweep has ever checked. This is a WORK-LIST SIZE,
--                          not a defect count, and gating on it would ship red on
--                          arrival. Measured at this migration: 3,621 carry a
--                          real id, of which the public half was swept by
--                          99970101100100 -- a 50-row random sample of the public
--                          remainder came back 0 non-human, so the residue is
--                          overwhelmingly draft rows, which return 404 to
--                          crawlers whatever seo_indexable says.
--
-- `probe_ok` and `rows_with_qid` are reported SEPARATELY from the counts,
-- because an empty table, a revoked grant and a clean corpus otherwise all
-- return the same reassuring zeroes.
--
-- service_role only. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member.

create or replace function public.personality_wikidata_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rows          int;
  v_disp          int;
  v_unverified    int;
  v_regressed     int;
  v_sentinel_lost int;
  v_text_back     int;
  v_examples      jsonb;
begin
  select count(*) into v_rows
    from public.personalities where wikidata_qid ~ '^Q[0-9]+$';

  select count(*) into v_disp
    from public.personalities where enrichment_status ? 'wrong_entity_candidate';

  select count(*) into v_unverified
    from public.personalities
   where wikidata_qid ~ '^Q[0-9]+$'
     and (visibility = 'public' or seo_indexable)
     and not (enrichment_status ? 'wrong_entity_candidate');

  -- The refuted identifier is back on the same row.
  --
  -- Scoped to `state='confirmed'` deliberately. `wrong_entity_candidate` is a
  -- SHARED key with three producers on prod at this migration: 125 rows written
  -- by 99991789833562 carrying `state='confirmed'` + a SKIP_ sentinel, 157 with
  -- no `state` at all, and 43 that are flagged as CANDIDATES and still carry
  -- their Q-id on purpose -- the name says candidate, not verdict. Without this
  -- scope the third group trips a zero-invariant and reds every PR in the repo
  -- for behaving correctly. It reads 0 either way today, which is exactly why
  -- the scope has to be deliberate rather than discovered later.
  select count(*) into v_regressed
    from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and enrichment_status -> 'wrong_entity_candidate' ->> 'qid' is not null
     and wikidata_qid = enrichment_status -> 'wrong_entity_candidate' ->> 'qid';

  -- a disposed row stopped recording its decision
  select count(*) into v_sentinel_lost
    from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and (wikidata_qid is null or wikidata_qid !~ '^SKIP_');

  -- the retracted biography returned verbatim
  select count(*) into v_text_back
    from public.personalities
   where enrichment_status -> 'wrong_entity_description_retracted' ->> 'from' is not null
     and description is not null
     and description = enrichment_status -> 'wrong_entity_description_retracted' ->> 'from';

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_examples from (
    select jsonb_build_object('slug', slug, 'qid', wikidata_qid,
             'was', enrichment_status -> 'wrong_entity_candidate' ->> 'label') x
      from public.personalities
     where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
       and (
            wikidata_qid = enrichment_status -> 'wrong_entity_candidate' ->> 'qid'
         or wikidata_qid is null
         or wikidata_qid !~ '^SKIP_'
       )
     limit 10
  ) s;

  return jsonb_build_object(
    'probe_ok',             true,
    'rows_with_qid',        v_rows,
    'dispositioned',        v_disp,
    'unverified_reachable', v_unverified,
    'qid_regressed',        v_regressed,
    'sentinel_lost',        v_sentinel_lost,
    'retracted_text_back',  v_text_back,
    'examples',             v_examples
  );
end $fn$;

revoke all on function public.personality_wikidata_signals() from public, anon, authenticated;
grant execute on function public.personality_wikidata_signals() to service_role;

comment on function public.personality_wikidata_signals() is
  'Watches the personality wrong-entity repairs (99970101100100, 99991789833562, 99991789840157) for regression. SQL cannot re-derive P31, so this checks a refuted identifier coming back, a lost SKIP_ sentinel, and a retracted biography returning -- all zero-invariants. unverified_reachable is a work-list size and is reported, never gated. service_role only.';

do $verify$
declare v jsonb;
begin
  v := public.personality_wikidata_signals();

  if (v ->> 'probe_ok') is distinct from 'true' then
    raise exception 'personality_wikidata_signals: probe did not report ok';
  end if;

  -- The three invariants must be clean the day this ships, or it is being
  -- introduced already-red and will be scrolled past.
  if (v ->> 'qid_regressed')::int <> 0 then
    raise exception 'personality_wikidata_signals: % row(s) already carry a refuted qid: %',
      v ->> 'qid_regressed', v ->> 'examples';
  end if;
  if (v ->> 'sentinel_lost')::int <> 0 then
    raise exception 'personality_wikidata_signals: % disposed row(s) lack a SKIP_ sentinel: %',
      v ->> 'sentinel_lost', v ->> 'examples';
  end if;
  if (v ->> 'retracted_text_back')::int <> 0 then
    raise exception 'personality_wikidata_signals: % retracted biograph(ies) returned',
      v ->> 'retracted_text_back';
  end if;

  -- POSITIVE CONTROL. All three counts above are zero on an empty table, on a
  -- revoked grant, and on a function that returns a literal. This asserts the
  -- probe is actually reading the corpus it claims to watch.
  if (v ->> 'rows_with_qid')::int < 1000 then
    raise exception 'personality_wikidata_signals: only % rows with a Q-id -- the probe is not reading the corpus',
      v ->> 'rows_with_qid';
  end if;
  if (v ->> 'dispositioned')::int < 100 then
    raise exception 'personality_wikidata_signals: only % dispositioned rows -- expected the three repairs'' output',
      v ->> 'dispositioned';
  end if;

  raise notice 'personality_wikidata_signals OK: % with qid, % dispositioned, % unverified reachable',
    v ->> 'rows_with_qid', v ->> 'dispositioned', v ->> 'unverified_reachable';
end $verify$;
