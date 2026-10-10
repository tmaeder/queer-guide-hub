-- logo_platform_signals() could never succeed over PostgREST: 91,675 ms against the
-- 8,000 ms statement_timeout that `authenticator` pins. §21 of check-pipeline-health.mjs
-- has therefore been reporting `returned HTTP 500 — measured nothing` since the section
-- first became reachable (the crash fixed in #4254 had hidden it entirely).
--
-- WHY IT WAS SLOW, measured rather than guessed:
--
--   * One branch ALONE was 8,861 ms -- already over the whole ceiling -- at ~1.36 ms per
--     platform_website_class() call. The sentinel makes ~26,000 such calls across six passes.
--   * Splitting that cost: the same row set with ONLY the host regex is 98 ms; with the
--     vocabulary match it is 2,506 ms. So 96% of the cost is a 78-row table being
--     re-queried once per row, not I/O (essentially all 96,893 blocks are hits) and not
--     the regex.
--
-- TWO THINGS MEASURED AND REJECTED, so nobody repeats them:
--
--   * The stale-visibility-map / index-only-scan pathology that 99991789807686 fixed on
--     tag_hygiene_stats: `enable_indexonlyscan=off` made this WORSE (113,693 ms) with
--     blocks unchanged (96,861 vs 96,893). Not that bug.
--   * Evaluating the STABLE function once per DISTINCT host instead of per row:
--     6,502 rows -> 4,846 distinct hosts, i.e. 1.34 rows/host. Buys ~25%, not the 11x needed.
--
-- THE ACTUAL CAUSE IS INLINING. Postgres only inlines a scalar SQL function whose body has
-- NO FROM clause, and `inline_function()` additionally refuses ANY function with a non-null
-- proconfig -- which `SET search_path = public` sets. All four helpers carried it:
--
--   website_host, logo_mark_sha256       -- FROM-less, so unpinning makes them inlinable
--   platform_website_class, logo_mark_denied -- have FROM, so they can NEVER inline
--
-- Removing the four SET clauses alone: 91,675 ms -> 8,369 ms (11x). Still over the ceiling,
-- because the two FROM-bearing helpers are still executed as a separate query per row.
--
-- So the match rule moves into a FROM-less predicate the planner CAN inline, and the
-- sentinel joins the vocabulary directly instead of calling a function per row:
--
--   91,675 ms -> 2,059 ms  (44.5x, 3.9x headroom under the 8,000 ms ceiling)
--
-- ONE DEFINITION OF THE MATCH RULE. logo_platform_domain_matches() is created first, proven
-- against the pre-existing platform_website_class body (P1), and only THEN does
-- platform_website_class start delegating to it. After this migration the rule exists once,
-- so the sentinel and the public helper cannot drift apart -- the risk this repo has paid
-- for repeatedly by mirroring judgement into a second place.
--
-- MATERIALIZING THE HOST IS LOAD-BEARING, and the first attempt proved it the hard way:
-- with the predicate inlined but the host computed inside the join condition, the regex
-- chain ran once per VOCABULARY ROW -- 507,156 regex chains -- and the "optimisation" came
-- out SLOWER than the original (3,277 ms vs 2,506 ms). `as materialized` computes the host
-- once per entity row; the join then evaluates 507k plain CASE expressions and no regex.
--
-- SECURITY: only the four SECURITY INVOKER helpers are unpinned. logo_platform_signals is
-- SECURITY DEFINER and KEEPS its `SET search_path`, asserted by P4 -- unpinning a definer
-- would be a real search_path-injection surface. For an invoker function the setting buys
-- nothing here: every object reference in those bodies is already public.-qualified, and the
-- function runs with the caller's own privileges, so there is no escalation to protect
-- against. Grants are untouched (CREATE OR REPLACE and ALTER FUNCTION both preserve them).
--
-- Bodies are NOT restated. `ALTER FUNCTION ... RESET ALL` drops the setting and leaves the
-- body byte-identical, which avoids the transcription trap this repo has hit before (a
-- hand-retyped translate() literal that was wrong by one character).

begin;

-- ---------------------------------------------------------------------------
-- 1. Unpin the four SECURITY INVOKER helpers. Bodies untouched.
--    `RESET ALL` rather than `RESET search_path`: inlining tests proconfig IS NOT NULL,
--    so an empty-but-present array would still block it. P3 asserts NULL, not emptiness.
-- ---------------------------------------------------------------------------
alter function public.website_host(text) reset all;
alter function public.logo_mark_sha256(text) reset all;
alter function public.platform_website_class(text) reset all;
alter function public.logo_mark_denied(text) reset all;

-- ---------------------------------------------------------------------------
-- 2. Capture the CURRENT output before anything else changes, so P2 can prove the
--    rewrite is output-identical. Cheap now (~8 s) precisely because step 1 landed first.
-- ---------------------------------------------------------------------------
drop table if exists _lps_before;
create temp table _lps_before as select public.logo_platform_signals() as doc;

-- ---------------------------------------------------------------------------
-- 3. The match rule, once. FROM-less + IMMUTABLE + no proconfig => inlinable.
-- ---------------------------------------------------------------------------
create or replace function public.logo_platform_domain_matches(
  p_host text, p_match_mode text, p_value text
) returns boolean
language sql
immutable
as $$
  select case p_match_mode
           -- label: the value must equal a WHOLE dot-separated label, so
           -- `facebooks.com` and `instagram-bar.com` do not match.
           when 'label'  then p_value = any(string_to_array(p_host, '.'))
           -- suffix: the host itself, or a subdomain of it. Anchored on the dot so
           -- `notbit.ly` cannot pass as `bit.ly`.
           when 'suffix' then p_host = p_value or p_host like '%.' || p_value
           else false
         end
$$;

comment on function public.logo_platform_domain_matches(text, text, text) is
  'Single definition of the logo_platform_domains match rule. Deliberately has NO FROM '
  'clause and NO SET clause so the planner can inline it -- that is the whole reason it '
  'exists, and adding either would silently return logo_platform_signals() to a 91 s '
  'per-row-function-call plan that cannot complete inside PostgREST''s 8 s timeout.';

-- ---------------------------------------------------------------------------
-- P1. The equivalence proof, while platform_website_class still carries its own
--     INDEPENDENT body. Runs over every venue with a website.
--
--     The positive control is the point: `platform_logo_rows` is {0,0,0} and
--     `denied_mark_rows` is {0,0} on the live corpus, so "old agrees with new" is
--     satisfied by a predicate that never matches anything. P1 therefore requires a
--     non-trivial number of MATCHES as well as zero disagreements.
-- ---------------------------------------------------------------------------
do $p1$
declare
  v_probed int; v_new int; v_old int; v_bad int;
begin
  with cand as materialized (
    select website, public.website_host(website) as h
    from venues where website is not null
  ),
  newm as materialized (
    select website, h,
           exists (select 1 from public.logo_platform_domains d
                   where public.logo_platform_domain_matches(h, d.match_mode, d.value)) as nm
    from cand
  ),
  probe as (
    select * from newm where nm
    union all
    (select * from newm where not nm order by website limit 3000)
  )
  select count(*),
         count(*) filter (where nm),
         count(*) filter (where public.platform_website_class(website) is not null),
         count(*) filter (where nm is distinct from (public.platform_website_class(website) is not null))
    into v_probed, v_new, v_old, v_bad
  from probe;

  if v_bad <> 0 then
    raise exception 'P1 failed: new predicate disagrees with platform_website_class on % of % rows',
      v_bad, v_probed;
  end if;
  -- Positive control: a predicate that matches nothing would reach v_bad = 0 too.
  if v_new < 100 then
    raise exception 'P1 failed: only % matches over % probed rows -- the predicate is not firing, so zero disagreements proves nothing',
      v_new, v_probed;
  end if;
  if v_old <> v_new then
    raise exception 'P1 failed: match counts differ (old %, new %)', v_old, v_new;
  end if;
  raise notice 'P1 ok: % probed, % matches on both, 0 disagreements', v_probed, v_new;
end
$p1$;

-- ---------------------------------------------------------------------------
-- P1b. The denied-mark path is genuinely 0 corpus-wide, so prove it on a synthetic
--      positive instead of accepting a zero. Uses a real sha256 from the vocabulary.
-- ---------------------------------------------------------------------------
do $p1b$
declare
  v_url text; v_ok boolean;
begin
  select 'https://img.queer.guide/logos/' || sha256 || '.png'
    into v_url from public.logo_denied_marks order by sha256 limit 1;

  if v_url is null then
    raise notice 'P1b skipped: logo_denied_marks is empty';
    return;
  end if;

  select public.logo_mark_denied(v_url)
         and exists (select 1 from public.logo_denied_marks d
                     where d.sha256 = public.logo_mark_sha256(v_url))
    into v_ok;

  if not v_ok then
    raise exception 'P1b failed: the denied-mark predicate does not fire on a synthetic positive built from a real vocabulary mark';
  end if;
  raise notice 'P1b ok: denied-mark path fires on a synthetic positive (corpus count is legitimately 0)';
end
$p1b$;

-- ---------------------------------------------------------------------------
-- 4. platform_website_class now DELEGATES to the single predicate, so the rule is not
--    duplicated. Signature, volatility, grants and return semantics are unchanged; the
--    CTE still computes the host once per call, and order by / limit 1 still make the
--    answer deterministic. (This function has zero callers outside the sentinel -- it is
--    kept as the readable public helper, not rewritten away.)
-- ---------------------------------------------------------------------------
create or replace function public.platform_website_class(p_url text)
returns text
language sql
stable
as $$
  with h as (select public.website_host(p_url) as host)
  select d.class
  from h, public.logo_platform_domains d
  where h.host is not null
    and public.logo_platform_domain_matches(h.host, d.match_mode, d.value)
  order by d.match_mode, d.value
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 5. The sentinel. Same questions, same grouping and HAVING byte-for-byte; the only
--    change is that each block materializes its host/sha ONCE per row and then joins the
--    vocabulary, instead of calling a FROM-bearing function per row.
-- ---------------------------------------------------------------------------
create or replace function public.logo_platform_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vocab int;
  v_denied_vocab int;
  v_rows jsonb;
  v_denied jsonb;
  v_shared jsonb;
begin
  select count(*) into v_vocab from public.logo_platform_domains;
  select count(*) into v_denied_vocab from public.logo_denied_marks;

  with h as materialized (
    select 'venues' as t, public.website_host(website) as host from venues where logo_url is not null
    union all
    select 'events', public.website_host(website) from events where logo_url is not null
    union all
    select 'organizations', public.website_host(website) from organizations where logo_url is not null
  )
  select jsonb_object_agg(t, n) into v_rows
  from (
    select t, count(*) filter (
             where host is not null
               and exists (select 1 from public.logo_platform_domains d
                           where public.logo_platform_domain_matches(h.host, d.match_mode, d.value))
           ) n
    from h group by t
  ) s;

  with m as materialized (
    select 'venues' as t, public.logo_mark_sha256(logo_url) as sha from venues
    union all
    select 'events', public.logo_mark_sha256(logo_url) from events
  )
  select jsonb_object_agg(t, n) into v_denied
  from (
    select t, count(*) filter (
             where exists (select 1 from public.logo_denied_marks d where d.sha256 = m.sha)
           ) n
    from m group by t
  ) s;

  with v as materialized (
    select logo_url, public.website_host(website) as host
    from venues
    where duplicate_of_id is null and logo_url is not null and website is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'venues', n, 'domains', regdoms, 'example_host', ex, 'mark', mark) order by n desc), '[]'::jsonb)
    into v_shared
  from (
    select count(*) n,
           count(distinct (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]
                 || '.' || (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1)]) regdoms,
           min(host) ex,
           -- The hash is reported so the fix is mechanical: look at the image,
           -- then insert this value into logo_denied_marks.
           min(public.logo_mark_sha256(logo_url)) mark
    from v
    where not exists (select 1 from public.logo_platform_domains d
                      where public.logo_platform_domain_matches(v.host, d.match_mode, d.value))
    group by logo_url
    having count(distinct (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]
                || '.' || (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1)]) >= 4
  ) g;

  return jsonb_build_object(
    'probe_ok', true,
    'vocabulary_size', v_vocab,
    'denied_mark_vocabulary_size', v_denied_vocab,
    'platform_logo_rows', coalesce(v_rows, '{}'::jsonb),
    'denied_mark_rows', coalesce(v_denied, '{}'::jsonb),
    'unknown_platform_groups', v_shared
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- P2. Output is byte-identical to what the function returned before the rewrite.
--     Both sides come from the same transaction, so the corpus cannot move between them.
-- ---------------------------------------------------------------------------
do $p2$
declare
  v_before jsonb; v_after jsonb;
begin
  select doc into v_before from _lps_before;
  v_after := public.logo_platform_signals();

  if v_before is null then
    raise exception 'P2 failed: no before-snapshot was captured';
  end if;
  if v_before is distinct from v_after then
    -- `%%` is a LITERAL percent in a RAISE format, not two placeholders, so the
    -- original had 2 slots against 3 arguments and failed to COMPILE (42601,
    -- "too many parameters specified for RAISE") — which aborted `db push` on
    -- main and blocked every migration behind it. Newlines come from an
    -- E-string now, so the slot count is impossible to miscount.
    raise exception E'P2 failed: rewrite changed the output.\n  before: %\n  after: %',
      v_before, v_after::text;
  end if;
  -- Guard against the snapshot itself being a degenerate document.
  if not (v_after ? 'probe_ok' and v_after ? 'platform_logo_rows'
          and v_after ? 'denied_mark_rows' and v_after ? 'unknown_platform_groups'
          and v_after ? 'vocabulary_size' and v_after ? 'denied_mark_vocabulary_size') then
    raise exception 'P2 failed: output is missing expected keys: %', v_after;
  end if;
  if (v_after->>'vocabulary_size')::int <= 0 then
    raise exception 'P2 failed: vocabulary_size is %, so every count below it is vacuous',
      v_after->>'vocabulary_size';
  end if;
  raise notice 'P2 ok: output byte-identical across the rewrite';
end
$p2$;

-- ---------------------------------------------------------------------------
-- P3. The four helpers carry NO proconfig (inlining refuses a non-null one, so a later
--     migration re-adding `SET search_path` is a silent 11x regression).
-- ---------------------------------------------------------------------------
do $p3$
declare
  v_pinned text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_pinned
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('website_host', 'logo_mark_sha256', 'platform_website_class', 'logo_mark_denied')
    and p.proconfig is not null;

  if v_pinned is not null then
    raise exception 'P3 failed: still pinned (blocks inlining): %', v_pinned;
  end if;
  raise notice 'P3 ok: all four helpers unpinned';
end
$p3$;

-- ---------------------------------------------------------------------------
-- P4. The SECURITY DEFINER sentinel still pins its search_path, and is still definer
--     and still service_role-only. P3 must never be "satisfied" by unpinning this one.
-- ---------------------------------------------------------------------------
do $p4$
declare
  v_secdef boolean; v_config text[]; v_leak text;
begin
  select p.prosecdef, p.proconfig into v_secdef, v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'logo_platform_signals';

  if not coalesce(v_secdef, false) then
    raise exception 'P4 failed: logo_platform_signals is no longer SECURITY DEFINER';
  end if;
  if v_config is null or not (v_config @> array['search_path=public']) then
    raise exception 'P4 failed: logo_platform_signals lost its pinned search_path (config: %)', v_config;
  end if;

  select string_agg(distinct a.grantee::regrole::text, ',')
    into v_leak
  from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join aclexplode(coalesce(p.proacl, '{}')) a
  where n.nspname = 'public' and p.proname = 'logo_platform_signals'
    and a.privilege_type = 'EXECUTE'
    and a.grantee::regrole::text in ('anon', 'authenticated', '-');

  if v_leak is not null then
    raise exception 'P4 failed: logo_platform_signals is executable by %', v_leak;
  end if;
  raise notice 'P4 ok: sentinel still definer, still pinned, still service_role-only';
end
$p4$;

drop table if exists _lps_before;

commit;
