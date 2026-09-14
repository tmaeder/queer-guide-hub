-- Geographic dedup: identity from real geographic sources and names, never proximity.
--
-- FINDING (measured on prod 2026-09-14). `run_dedup_truth_sweep('city','dry_run')`
-- returned `{would_merge: 0, would_queue: 118}` -- and ALL 118 came from one arm,
-- `geo_only_2km`, which pairs rows whose despaced names DIFFER on nothing but
-- distance. So 100% of the city engine's live output was a proposal to merge two
-- differently-named places. 122 such rows sat open in `dedup_review_queue`.
--
-- What the arm actually proposed, read by hand:
--   Ueberlingen (Lake Constance) <-> Wernigerode (the Harz)      at "0 m"
--   Le Cannet (Cote d'Azur)      <-> Carbonne (Haute-Garonne)    at "0 m"
--   Pirna (Saxony)               <-> Baden-Baden (Baden-Wuerttemberg) at 265 m
--   Garden Grove, California     <-> Egham, Surrey England       at 580 m
--   New York <-> Manhattan; Cirencester <-> Cotswold; Stepney <-> Limehouse
-- Every one of those is two real, distinct places. The pairs are hundreds of
-- kilometres apart on the ground; the metre readings are the PLACEHOLDER
-- COORDINATE signature this repo already recorded for venue dedup -- a missing
-- geocode falls back to a shared centroid, so "0 m" means "neither row has a
-- real coordinate", not "these are the same place". Distance between two
-- differently-named rows is not evidence of identity, and this arm is deleted.
--
-- WHAT REPLACES IT -- identity from a gazetteer, or from the name itself:
--
--   ARM qid_exact      one Wikidata item is one place. Holds across spellings,
--                      scripts and exonyms. Matches 0 pairs today (measured):
--                      the corpus is already clean by this test. It is the
--                      forward mechanism, and it costs nothing.
--   ARM name_exact     identical name key in one country -- the pre-existing
--                      arm, unchanged in shape, now VETOED by a disagreeing
--                      Wikidata id or a disagreeing region. That veto is the
--                      Springfield case: two real cities of one name in one
--                      country, which `cities` cannot otherwise tell apart.
--   ARM name_qualifier "X, <that row's OWN country or region>" is the name X
--                      carrying a qualifier, not a second place. This is a NAME
--                      match -- the qualifier is corroborated by the row's own
--                      country/region column -- not a proximity match. 26 pairs
--                      exist; all 26 were read by hand and all 26 are correct
--                      (Berlin <-> "Berlin, Germany", Madrid <-> "Madrid,
--                      Community of Madrid"). Every drop row holds 0 venues
--                      while the keep rows hold the content (Berlin 1012,
--                      Madrid 429, Basel 340).
--
-- The qualifier arm requires the BASE row to carry a Wikidata id, so nothing is
-- asserted from the name alone. That gate is what excludes the 26th pair,
-- "Camden" <-> "Camden, Australia", where neither side has an id, neither holds
-- content, and "Camden" is equally the London borough. 25 merge, 1 is left for a
-- human. Preferring a null to a guess is the rule here.
--
-- COUNTRY: identity is the ISO 3166-1 alpha-2 code. The arm auto-merged on name
-- equality with no corroboration at all; a disagreeing code now vetoes it.
--
-- QUEER VILLAGES: the arm is already same-city + identical name key, which is
-- name-based and needs no change. Villages carry no gazetteer id.
--
-- Surgery, not a restatement: `run_dedup_truth_sweep` is ~34k characters shared
-- by 12 entity types, and re-emitting it here would be a merge-collision surface
-- for every other type. The two arm blocks are spliced by locating their exact
-- delimiters, and the postconditions below assert the result rather than trusting
-- the splice. Soft on preconditions (an already-fixed function is a no-op success,
-- so a re-run or a concurrent landing cannot abort `db push` for the whole repo),
-- hard on postconditions.

do $geo$
declare
  v_src   text;
  v_new   text;
  v_start int;
  v_end   int;
  v_pat   text;
  v_city    text := $arm$  when 'city' then $q$
    with live as (
      select c.id, c.name, c.country_id, c.region_name,
             c.latitude lat, c.longitude lng, c.wikidata_qid qid,
             public.dedup_despace(c.name) dsp,
             public.dedup_despace(regexp_replace(c.name, '\s*,\s*[^,]+$', '')) base,
             btrim(substring(c.name from ',\s*([^,]+)$')) tail,
             co.name cname, co.code ccode,
             c.completeness_score::numeric q, c.is_capital::boolean f,
             c.created_at::timestamptz c_at
      from public.cities c
      left join public.countries co on co.id = c.country_id
      where c.duplicate_of_id is null and c.shell_status is distinct from 'merged')
    select * from (
      -- qid_exact: one Wikidata item is one place. A real gazetteer identifier,
      -- so it holds across spellings, scripts and exonyms.
      select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
             true is_auto, 0.99::numeric conf, 'qid_exact' reason,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
             a.q aq, a.f af, a.c_at ac, b.q bq, b.f bf, b.c_at bc
      from live a join live b on a.id < b.id
      where a.qid is not null and a.qid = b.qid
      union all
      -- name_exact: identical name key in one country. A disagreeing Wikidata id
      -- or region vetoes it -- two real cities of one name in one country.
      select a.id, b.id, a.name, b.name,
             coalesce(public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000, false),
             case when coalesce(public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000, false)
                  then 0.97 else 0.85::numeric end,
             case when coalesce(public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000, false)
                  then 'name_exact_geo' else 'name_exact_no_geo' end,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng),
             a.q, a.f, a.c_at, b.q, b.f, b.c_at
      from live a join live b on a.country_id = b.country_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
        and not (a.qid is not null and b.qid is not null and a.qid <> b.qid)
        and not (a.region_name is not null and b.region_name is not null
                 and public.dedup_despace(a.region_name) <> public.dedup_despace(b.region_name))
      union all
      -- name_qualifier: "X, <own country or region>" is the name X with a
      -- qualifier. The base row must carry a gazetteer id, so the claim never
      -- rests on the name alone.
      -- Orientation is PINNED, not scored. The caller's canonical pick is
      -- quality->featured->oldest, and for this arm that is the wrong question:
      -- which row survives is decided by which one carries the qualifier, never
      -- by which one happens to score higher. Today all 25 pairs would orient
      -- correctly under scoring anyway -- a shell with a higher completeness
      -- score would silently rename Berlin to "Berlin, Germany", so the constants
      -- below remove that possibility instead of relying on it not happening.
      select a.id, b.id, a.name, b.name,
             true, 0.95::numeric, 'name_qualifier',
             public.haversine_m(a.lat,a.lng,b.lat,b.lng),
             1::numeric, true, a.c_at, 0::numeric, false, b.c_at
      from live a join live b
        on a.country_id = b.country_id and a.id <> b.id
       and b.base = a.dsp and b.base <> b.dsp
      where length(a.dsp) >= 3
        and a.qid is not null and b.qid is null
        and public.dedup_despace(b.tail) in (
              public.dedup_despace(a.cname), lower(a.ccode), public.dedup_despace(a.region_name))
        and coalesce(public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 25000, true)
    ) u order by is_auto desc, conf desc limit 800 $q$$arm$;
  v_country text := $arm$  when 'country' then $q$
    with live as (
      select id, name, code, public.dedup_despace(name) dsp,
             content_completeness_score::numeric q, false::boolean f, created_at::timestamptz c
      from public.countries
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           true is_auto, 0.95::numeric conf, 'name_exact_iso' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
      and not (a.code is not null and b.code is not null and upper(a.code) <> upper(b.code))
    limit 800 $q$$arm$;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_dedup_truth_sweep';

  if v_src is null then
    raise exception 'run_dedup_truth_sweep is absent';
  end if;

  if position('geo_only_2km' in v_src) = 0 and position('qid_exact' in v_src) > 0 then
    raise notice 'geo dedup arms already rebuilt -- no-op';
    return;
  end if;

  ---------------------------------------------------------------- city
  v_start := position($p$  when 'city' then $q$$p$ in v_src);
  if v_start = 0 then raise exception 'city arm delimiter not found'; end if;
  v_pat := $p$) u order by is_auto desc, conf desc limit 800 $q$$p$;
  v_end := position(v_pat in substring(v_src from v_start));
  if v_end = 0 then raise exception 'city arm terminator not found'; end if;
  v_end := v_start + v_end - 1 + length(v_pat);
  v_new := substring(v_src from 1 for v_start - 1) || v_city || substring(v_src from v_end);

  ---------------------------------------------------------------- country
  v_start := position($p$  when 'country' then $q$$p$ in v_new);
  if v_start = 0 then raise exception 'country arm delimiter not found'; end if;
  v_pat := $p$limit 800 $q$$p$;
  v_end := position(v_pat in substring(v_new from v_start));
  if v_end = 0 then raise exception 'country arm terminator not found'; end if;
  v_end := v_start + v_end - 1 + length(v_pat);
  v_new := substring(v_new from 1 for v_start - 1) || v_country || substring(v_new from v_end);

  execute v_new;
end
$geo$;

-- Postconditions: assert the REACHED state, not the splice.
do $verify$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_dedup_truth_sweep';

  if position('geo_only_2km' in v_src) > 0 then
    raise exception 'the proximity arm survived the rebuild';
  end if;
  if position('qid_exact' in v_src) = 0
     or position('name_qualifier' in v_src) = 0
     or position('name_exact_iso' in v_src) = 0 then
    raise exception 'a real-source arm is missing after the rebuild';
  end if;
  -- the Springfield veto and the ISO veto must both be present
  if position('a.region_name is not null and b.region_name is not null' in v_src) = 0 then
    raise exception 'the region veto is missing from the name_exact arm';
  end if;
  if position('upper(a.code) <> upper(b.code)' in v_src) = 0 then
    raise exception 'the ISO code veto is missing from the country arm';
  end if;

  -- and the engine must still run for every geographic type
  perform public.run_dedup_truth_sweep('city','dry_run');
  perform public.run_dedup_truth_sweep('country','dry_run');
  perform public.run_dedup_truth_sweep('queer_village','dry_run');
end
$verify$;
