-- Fix search_facets_parity_failures(): sum() returns NUMERIC, and the RETURN QUERY
-- declares bigint, so every call raised
--   42804 structure of query does not match function result type
--   DETAIL: Returned type numeric does not match expected type bigint in column 3
--
-- plpgsql only type-checks a RETURN QUERY when the function is CALLED, not when it
-- is created, so 20260829045147 applied cleanly and the gate would have failed on
-- its first CI run — reporting a divergence that does not exist. Shipping a gate
-- without invoking it once is how you get a check that cries wolf on day one.
--
-- Only change: ::bigint on the coalesce(sum(...)) expressions.
-- Measured after the fix: 0 failures, 1.63-1.73 s over three runs (PostgREST's
-- statement_timeout is 8 s — see tag_hygiene_stats, which sat on that boundary and
-- failed half of all CI runs).

create or replace function public.search_facets_parity_failures()
returns table(probe text, hybrid_total bigint, facet_total bigint, detail text)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  v extensions.vector;
  gated_city text;
  anon_h bigint; anon_f bigint;
  inc_h bigint;  inc_f bigint;
begin
  -- A deterministic vector, chosen without hardcoding any content.
  select embedding into v
  from public.search_embeddings
  where embedding is not null
  order by doc_id
  limit 1;

  select sd.city into gated_city
  from public.search_documents sd
  where sd.safety_gated and sd.city is not null
  group by sd.city
  order by count(*) desc, sd.city
  limit 1;

  -- Generic probes: two hybrid (vector arm engaged) + one type-scoped keyword-only.
  return query
  select x.name, x.h, x.f,
         format('search_facets counted %s candidates, search_hybrid.total counted %s', x.f, x.h)
  from (
    select p.name,
           (public.search_hybrid(p.q, case when p.use_vec then v end, p.types, '{}'::jsonb,
                                 null, null, null, now(), 1, 0,
                                 null, null, null, null, null)->>'total')::bigint as h,
           coalesce((select sum(value::bigint)
                     from jsonb_each_text(
                       public.search_facets(p.q, p.types, '{}'::jsonb, null, null, null, now(),
                                            case when p.use_vec then v end)->'type')), 0)::bigint as f
    from (values
      ('hybrid:berghain', 'berghain', null::text[],   true),
      ('hybrid:naloxone', 'naloxone', null::text[],   true),
      ('keyword:bookshop','bookshop', array['venue'], false)
    ) p(name, q, types, use_vec)
  ) x
  where x.h <> x.f;

  if gated_city is null then
    return query select 'gated:probe'::text, 0::bigint, 0::bigint,
      'no safety_gated row carries a city — the gating probe cannot run, so this gate proves nothing'::text;
    return;
  end if;

  select (public.search_hybrid('', null, null, jsonb_build_object('city', gated_city),
                               null, null, null, now(), 1, 0,
                               null, null, null, null, null)->>'total')::bigint,
         coalesce((select sum(value::bigint) from jsonb_each_text(
           public.search_facets('', null, jsonb_build_object('city', gated_city),
                                null, null, null, now(), null)->'type')), 0)::bigint
    into anon_h, anon_f;

  select (public.search_hybrid('', null, null, jsonb_build_object('city', gated_city, 'include_gated', true),
                               null, null, null, now(), 1, 0,
                               null, null, null, null, null)->>'total')::bigint,
         coalesce((select sum(value::bigint) from jsonb_each_text(
           public.search_facets('', null, jsonb_build_object('city', gated_city, 'include_gated', true),
                                null, null, null, now(), null)->'type')), 0)::bigint
    into inc_h, inc_f;

  if anon_h <> anon_f then
    return query select 'gated:anon'::text, anon_h, anon_f,
      format('anon facets describe %s candidates in %s while anon results contain %s — gated content is leaking into the facet block',
             anon_f, gated_city, anon_h);
  end if;

  if inc_h <> inc_f then
    return query select 'gated:included'::text, inc_h, inc_f,
      format('include_gated facets (%s) disagree with include_gated results (%s) for %s', inc_f, inc_h, gated_city);
  end if;

  if inc_h <= anon_h then
    return query select 'gated:discrimination'::text, anon_h, inc_h,
      format('include_gated did not widen the set for %s (%s -> %s) — the gating probes are vacuous and prove nothing',
             gated_city, anon_h, inc_h);
  end if;
end
$fn$;

comment on function public.search_facets_parity_failures() is
  'Drift gate: returns one row per probe where search_facets and search_hybrid disagree about the candidate set. Empty result = in step. See 20260829041548 for the divergence this exists to prevent recurring.';

revoke execute on function public.search_facets_parity_failures() from public, anon;
grant  execute on function public.search_facets_parity_failures() to service_role;
