-- Sentinel: no geographic merge suggestion may name two different places.
--
-- Standalone, not a new key on `pipeline_hygiene_stats()` -- that body is long and
-- restating it to add a counter is a merge-collision surface, which is why the
-- venue, event, news and tag signals are all separate functions too.
--
-- The invariant is stated over the QUEUE, which is what a human is shown and can
-- approve, and over the ENGINE, which is what fills it. Both are needed: an empty
-- queue proves nothing while an arm that produces different-name pairs is still
-- installed, and a clean arm proves nothing while 122 bad rows sit open.
--
-- WHAT COUNTS AS "the same name": an identical name key, or one side carrying a
-- trailing qualifier ("Berlin" vs "Berlin, Germany"). Everything else is two
-- names. Exonyms (Brugge/Bruges) are deliberately NOT excused here -- they are
-- only mergeable on a shared Wikidata id, and a pair proven that way never needs
-- to reach the queue at all.
--
-- `probe_ok` is reported SEPARATELY from the counts. An unreadable engine, a
-- revoked grant and a clean corpus otherwise all return the same reassuring zero,
-- and this repo has been burned by exactly that before -- so a broken probe
-- reports NULL, never 0, and the health script fails on it.

create or replace function public.geo_dedup_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_open_diff_name int;
  v_open_total     int;
  v_arm_retired    boolean;
  v_real_arms      boolean;
  v_probe_ok       boolean := true;
  v_city           jsonb;
  v_country        jsonb;
  v_village        jsonb;
  v_src            text;
begin
  -- queue side: open geographic pairs naming two different places
  select count(*) filter (
           where public.dedup_despace(ka.name) <> public.dedup_despace(da.name)
             and public.dedup_despace(regexp_replace(da.name, '\s*,\s*[^,]+$', ''))
                 <> public.dedup_despace(ka.name)
             and public.dedup_despace(regexp_replace(ka.name, '\s*,\s*[^,]+$', ''))
                 <> public.dedup_despace(da.name)),
         count(*)
    into v_open_diff_name, v_open_total
  from public.dedup_review_queue q
  join public.cities ka on ka.id = q.keep_id
  join public.cities da on da.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open';

  -- engine side: the retired arm must stay retired, the real-source arms present
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_dedup_truth_sweep';

  if v_src is null then
    v_probe_ok := false;
  else
    v_arm_retired := position('geo_only_2km' in v_src) = 0;
    v_real_arms   := position('qid_exact' in v_src) > 0
                 and position('name_qualifier' in v_src) > 0
                 and position('name_exact_iso' in v_src) > 0;
  end if;

  begin
    v_city    := public.run_dedup_truth_sweep('city','dry_run');
    v_country := public.run_dedup_truth_sweep('country','dry_run');
    v_village := public.run_dedup_truth_sweep('queer_village','dry_run');
  exception when others then
    v_probe_ok := false;
  end;

  return jsonb_build_object(
    'probe_ok',              v_probe_ok,
    'open_city_pairs',       v_open_total,
    'open_diff_name_pairs',  v_open_diff_name,
    'proximity_arm_retired', v_arm_retired,
    'real_source_arms',      v_real_arms,
    'city_would_merge',      case when v_probe_ok then v_city->'would_merge' end,
    'city_would_queue',      case when v_probe_ok then v_city->'would_queue' end,
    'country_would_merge',   case when v_probe_ok then v_country->'would_merge' end,
    'village_would_merge',   case when v_probe_ok then v_village->'would_merge' end,
    'measured_at',           now()
  );
end
$function$;

comment on function public.geo_dedup_signals() is
  'Geographic dedup invariant: never suggest merging two differently-named places. '
  'Zero-tolerance on open_diff_name_pairs and on the retired proximity arm.';

-- SECURITY DEFINER aggregate: service_role only. A definer function granted to
-- `authenticated` is granted to every signed-in member.
revoke all on function public.geo_dedup_signals() from public, anon, authenticated;
grant execute on function public.geo_dedup_signals() to service_role;

do $verify$
declare v jsonb;
begin
  v := public.geo_dedup_signals();
  if not (v->>'probe_ok')::boolean then
    raise exception 'geo_dedup_signals probe failed';
  end if;
  if (v->>'open_diff_name_pairs')::int <> 0 then
    raise exception '% open city pairs name two different places', v->>'open_diff_name_pairs';
  end if;
  if not (v->>'proximity_arm_retired')::boolean then
    raise exception 'the proximity arm is still installed';
  end if;
  if not (v->>'real_source_arms')::boolean then
    raise exception 'the real-source arms are not installed';
  end if;
end
$verify$;
