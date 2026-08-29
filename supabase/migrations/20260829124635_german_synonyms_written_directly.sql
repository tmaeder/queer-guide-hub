-- The German aliases still did not reach search, and the reason was not the one
-- 20261007160400 fixed.
--
-- APPLIED VIA MCP AND COMMITTED AT THE STAMPED VERSION, per the CLAUDE.md
-- early-apply convention. The deploy queue was blocked on an unrelated
-- non-idempotent constraint at the time, and this had to be verifiable on prod.
--
-- WHAT 20261007160400 ASSUMED, AND WHY IT WAS A NO-OP
--
-- It flipped search_synonyms.status from 'approved' to 'active' for this
-- vocabulary, on the premise that tag_alias_sync_search_synonym had already
-- created a row per alias. It had not. Measured after that migration applied:
-- the five sample aliases exist and have ZERO synonym rows between them, and
-- search_synonyms holds 360 rows in total — not the thousands implied by 15k
-- aliases.
--
-- The deployed trigger carries a line the migration that created it does not,
-- added later by 20260910151200:
--
--   if new.review_status is distinct from 'approved' then return new; end if;
--
-- So an alias that is not 'approved' produces no synonym at all. Every alias in
-- this vocabulary is deliberately 'auto', because an approved alias IS an
-- auto-tagging rule and these are ordinary words. The two requirements are in
-- direct conflict through the alias path: 'approved' buys search expansion and
-- also tags every recipe mentioning Pilze as a psychedelic; 'auto' buys neither.
-- 20261003110400's header claimed 'auto' still reaches search. It does not, and
-- it never did.
--
-- THE ASSERTION COULD NOT CATCH IT, WHICH IS THE REUSABLE PART
--
-- 20261007160400 asserted that no activate-list row was left 'approved'. With
-- no rows at all that is trivially true, so it passed while doing nothing. An
-- assertion phrased as "nothing is left undone" cannot tell success from an
-- empty set. This migration asserts an absolute floor instead, so an empty set
-- fails loudly.
--
-- THE FIX
--
-- Write the synonym rows directly instead of going through the alias gate.
-- Safe in the one way that matters: run_tag_assignment_reconcile builds its
-- auto-tagging map from unified_tags.name/slug and tag_aliases.alias_name
-- filtered on review_status, and does NOT read search_synonyms — verified
-- against the live function body, zero occurrences. So a synonym row grants
-- query expansion and grants nothing else. The aliases stay 'auto'.
--
-- Scope is the same unambiguous list 20261007160400 chose, for the same reason:
-- query expansion has the identical ordinary-word hazard as auto-tagging, aimed
-- at the reader rather than the row. Gras, Schnee, Koks, Pilze, Speed, Ice and
-- Acid are NOT here, and the closing assertion fails if any of them is active.

do $mig$
declare
  v_terms text[] := array[
    'lachgas','sahnekapseln','sahnepatronen','naloxon','amylnitrit',
    'isopropylnitrit','alkylnitrite','mephedron','metaphedrone',
    'kräutermischung','delirantia','nachtschattengewächse','tollkirsche',
    'stechapfel','engelstrompete','scopolamin','mitragynin','pervitin',
    'valoron','tramal','lexotanil','bromazanil','temesta','tavor','dormicum',
    'makatussin','diaphin','xanax','drogennotfall','mischkonsum',
    'drogenanalyse','reagenztest','stabile seitenlage','reanimation',
    'krampfanfall','kreislaufkollaps','hitzschlag','entzugsdelir',
    'schadensminderung','überdosis','halbwertszeit','bioverfügbarkeit',
    'volumetrisches dosieren','feinwaage','gamma-aminobuttersäure',
    'ich-auflösung','ego-tod','horrortrip','mao-hemmer','dissoziativa',
    'psychedelika','stimulanzien','opioide','benzodiazepine','entzug'
  ];
  v_aliases int;
  v_active  int;
  v_written int;
begin
  perform set_config('app.actor', 'migration:german-synonyms-direct', true);

  insert into public.search_synonyms (
    terms, replacements, locale, indexes, is_one_way,
    status, source, tag_id, tag_alias_id, notes
  )
  select array[lower(a.alias_name)], array[lower(t.name)], '*', '{}'::text[], true,
         'active', 'imported', t.id, a.id,
         'german harm-reduction vocabulary; written directly because the alias is deliberately review_status=auto'
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = any (v_terms)
     and t.status = 'active'
     and t.merged_into_id is null
     and lower(a.alias_name) <> lower(t.name)
  on conflict (tag_alias_id) where tag_alias_id is not null
  do update set status = 'active';
  get diagnostics v_written = row_count;

  select count(*) into v_aliases
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = any (v_terms) and t.status = 'active'
     and t.merged_into_id is null and lower(a.alias_name) <> lower(t.name);

  select count(*) into v_active
    from public.search_synonyms s
    join public.tag_aliases a on a.id = s.tag_alias_id
   where lower(a.alias_name) = any (v_terms) and s.status = 'active';

  -- Non-vacuous on purpose: an absolute floor, so an empty set fails instead of
  -- passing. This is exactly what 20261007160400 lacked.
  if v_aliases < 30 then
    raise exception 'german synonyms: only % matching alias(es) found; expected at least 30', v_aliases;
  end if;
  if v_active <> v_aliases then
    raise exception 'german synonyms: % alias(es) matched but only % have an active synonym', v_aliases, v_active;
  end if;

  -- The ordinary words must not have been swept in.
  if exists (
    select 1 from public.search_synonyms s
     where s.status = 'active'
       and exists (select 1 from unnest(s.terms) x
                    where lower(x) = any (array['pilze','gras','schnee','koks','speed','ice','acid','emma','pillen','ballon','toleranz']))
  ) then
    raise exception 'german synonyms: an ordinary-word synonym is active';
  end if;

  raise notice 'german synonyms: % rows written, % active over % aliases', v_written, v_active, v_aliases;
end
$mig$;
