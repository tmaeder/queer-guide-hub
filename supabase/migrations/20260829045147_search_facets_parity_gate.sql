-- Drift gate: search_facets must count the SAME candidate set search_hybrid ranks.
--
-- NOTE: this version has a return-type bug (sum() yields numeric, the signature
-- says bigint) that only surfaces when the function is CALLED. It is committed at
-- its applied version because prod recorded it; 20260829045226 immediately
-- supersedes it. Read that one for the working body.
--
-- WHY A TEST AND NOT JUST A FIX. 20260829041548 closed four divergences at once
-- (safety_gated, include_gated, closed_at, the vector arm) — but the root cause is
-- that the two functions build their candidate sets BY HAND, in two places, and
-- nothing forces them to agree. The gating one had been live since 20260623160001
-- and leaked a per-category breakdown of gated venues in criminalising countries
-- to anonymous callers. The next divergence will happen the same way.
--
-- The gate asserts the PROPERTY (same candidate-set size) rather than text-scanning
-- for specific clauses, so it catches a divergence however it is spelled — a new
-- filter added to one and not the other, in either direction.
--
-- PROVEN TO FAIL, not just to pass. Replaying the pre-fix search_facets body:
--     probe              hybrid   old facets
--     hybrid:berghain      65        26        under-counts (no vector arm)
--     hybrid:naloxone      43         4        under-counts
--     gated:anon            1        81        OVER-counts (no gating)
-- Both directions are caught. That matters here because the two real bugs pushed
-- opposite ways and so never showed up as a constant offset.
--
-- LIMITATION, stated honestly: this compares candidate-set SIZE (the summed 'type'
-- facet vs search_hybrid.total), not membership. Two sets of equal size but
-- different contents would pass. Every divergence found so far changed the size,
-- and a full membership diff would mean one search_hybrid call per entity type per
-- probe. The type-scoped probe below narrows that gap.
--
-- VACUITY GUARD: the gating probes only prove anything if a gated row with a city
-- actually exists, and if include_gated genuinely widens the set. If either is
-- untrue the function emits a FAILURE saying so, rather than passing silently —
-- a gate that proves nothing must not read as green.

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
                                            case when p.use_vec then v end)->'type')), 0) as f
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
                                null, null, null, now(), null)->'type')), 0)
    into anon_h, anon_f;

  select (public.search_hybrid('', null, null, jsonb_build_object('city', gated_city, 'include_gated', true),
                               null, null, null, now(), 1, 0,
                               null, null, null, null, null)->>'total')::bigint,
         coalesce((select sum(value::bigint) from jsonb_each_text(
           public.search_facets('', null, jsonb_build_object('city', gated_city, 'include_gated', true),
                                null, null, null, now(), null)->'type')), 0)
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
