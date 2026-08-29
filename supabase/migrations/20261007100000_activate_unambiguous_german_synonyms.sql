-- Activate the German search synonyms that are safe to activate, and only those.
--
-- WHY THIS EXISTS
--
-- 20261003110400 added 109 German and scene aliases and claimed in its header
-- that they would make German queries resolve. Measured on prod after it
-- shipped, they did not. The alias rows are correct and render on the tag pages;
-- the search half never worked.
--
-- The reason is a deliberate gate, not a bug. tag_alias_sync_search_synonym
-- projects every new alias into search_synonyms with `status='approved'`, and
-- 20260429100000 explains the choice in its own header: "Status is 'approved'
-- (not 'active') by design ... NOT projected ... until an admin explicitly
-- activates them. This avoids changing search behaviour as a side effect of
-- installing this migration." The query-expansion layer reads
-- `status=eq.active` only (workers/search-proxy/src/pgSynonyms.ts), so an
-- approved-but-not-active synonym is inert.
--
-- That gate is right and is not being removed. This migration walks through it
-- deliberately for a named subset, which is what it was built for.
--
-- THE SPLIT IS THE SAME ONE THE ALIAS MIGRATION ALREADY MADE, FOR THE SAME REASON
--
-- 20261003110400 refused to mark ordinary words as `approved` aliases because an
-- approved alias is an auto-tagging rule and "Pilze" is German for mushrooms —
-- a recipe would be tagged as a psychedelic. Query expansion has the identical
-- hazard pointed at the reader instead of the row: activating Pilze -> psilocybin
-- means somebody searching for mushroom restaurants gets drug pages. Gras is
-- grass, Schnee is snow, Trüffel is truffles, Koks is also slang for coal in
-- older German, and Speed, Ice, Pot, Acid, Blotter, Emma, Peter and Kitty are
-- ordinary English words. None of those is activated here.
--
-- What IS activated is the set of terms that mean one thing: compound nouns and
-- technical vocabulary with no everyday sense (Drogennotfall, Mischkonsum,
-- Halbwertszeit, Stabile Seitenlage), and unambiguous substance names
-- (Lachgas, Naloxon, Amylnitrit). A false positive from these is close to
-- impossible — nobody searching for anything else types "Entzugsdelir".
--
-- Ambiguity is judged per term rather than by language. "Toleranz" is excluded
-- even though it is technical vocabulary, because the platform carries a
-- `tolerance` tag about accepting people's differences and a `drug-tolerance`
-- tag about pharmacology — the exact collision 20261003110000 was careful about,
-- and a synonym would send the German word for the social virtue to the drug page.
--
-- SCOPE IS THE ALIAS ROWS, NOT THE TERMS
--
-- Rows are selected by joining search_synonyms.tag_alias_id to the alias rows
-- this vocabulary created, so nothing outside it can be caught by a coincidental
-- term match, and an admin's own activations are untouched. Approved synonyms
-- created by anything else stay approved.

set local statement_timeout = '300s';

do $mig$
declare
  v_activate text[] := array[
    -- unambiguous substance and product names
    'lachgas', 'sahnekapseln', 'sahnepatronen',
    'naloxon', 'amylnitrit', 'isopropylnitrit', 'alkylnitrite',
    'mephedron', 'metaphedrone', 'kräutermischung',
    'delirantia', 'nachtschattengewächse', 'tollkirsche', 'stechapfel',
    'engelstrompete', 'scopolamin', 'mitragynin',
    -- brand names
    'pervitin', 'valoron', 'tramal', 'lexotanil', 'bromazanil', 'temesta',
    'tavor', 'dormicum', 'makatussin', 'diaphin', 'xanax',
    -- technical compounds with no everyday sense
    'drogennotfall', 'mischkonsum', 'drogenanalyse', 'reagenztest',
    'stabile seitenlage', 'reanimation', 'krampfanfall', 'kreislaufkollaps',
    'hitzschlag', 'entzugsdelir', 'schadensminderung', 'überdosis',
    'halbwertszeit', 'bioverfügbarkeit', 'volumetrisches dosieren',
    'feinwaage', 'gamma-aminobuttersäure', 'ich-auflösung', 'ego-tod',
    'horrortrip', 'mao-hemmer', 'dissoziativa', 'psychedelika',
    'stimulanzien', 'opioide', 'benzodiazepine', 'entzug',
    'safer use regeln', 'safer sniffing regeln', 'safer use beim spritzen'
  ];
  v_never text[] := array[
    -- ordinary words in German or English; see header
    'pilze', 'zauberpilze', 'trüffel', 'gras', 'hasch', 'blüten', 'schnee',
    'koks', 'speed', 'pep', 'amphi', 'acid', 'pappen', 'filze', 'löschpapier',
    'blotter', 'emma', 'pillen', 'ballon', 'ice', 'freebase', 'ganja',
    'psilos', 'hero', 'shore', 'keti', 'ket', 'vitamin k', 'alk', 'dias',
    'tillis', 'xani', 'oxy', 'mst', 'lean', 'purple drank', 'sizzurp',
    'ketum', 'meow', 'm-cat', 'salvinorin a', 'benzos', 'downer', 'yaba',
    'shabu', 'ethanol', 'liquid ecstasy', 'k.-o.-tropfen', 'toleranz'
  ];
  v_on   int;
  v_off  int;
  v_bad  int;
begin
  perform set_config('app.actor', 'admin:german-synonym-activation', true);

  -- Activate, scoped to the alias rows this vocabulary owns.
  update public.search_synonyms s
     set status = 'active'
   where s.status = 'approved'
     and s.tag_alias_id is not null
     and exists (
       select 1
         from public.tag_aliases a
         join public.unified_tags t on t.id = a.canonical_tag_id
        where a.id = s.tag_alias_id
          and t.status = 'active'
          and lower(a.alias_name) = any (v_activate)
     );
  get diagnostics v_on = row_count;

  ---------------------------------------------------------------------------
  -- Assertions.
  ---------------------------------------------------------------------------

  -- No ordinary word from THIS vocabulary may be active.
  --
  -- SCOPED ON PURPOSE, AND THE SCOPE IS THE WHOLE LESSON. The first draft of
  -- this check ran corpus-wide — any active synonym anywhere whose term is on
  -- the never-list. That is an invariant this migration cannot establish: an
  -- admin may have deliberately activated "speed" or "ice" years ago through
  -- the Synonyms tab, and this file has no business overruling that and no way
  -- to repair it. A migration that asserts a corpus invariant it cannot reach
  -- aborts `db push` and blocks every migration queued behind it — which is
  -- exactly what 20261003110400's own closing assertions did, three deploys
  -- running, until someone cleared prod by hand (20260829063509).
  --
  -- So the assertion covers only rows this migration could have written: those
  -- whose tag_alias_id belongs to the substances vocabulary. Inside that scope
  -- the migration fully controls the outcome, so a failure here is a real bug
  -- in the list above rather than pre-existing state.
  select count(*) into v_bad
    from public.search_synonyms s
    join public.tag_aliases a on a.id = s.tag_alias_id
    join public.unified_tags t on t.id = a.canonical_tag_id
   where s.status = 'active'
     and t.category = 'Substances & Harm Reduction'
     and lower(a.alias_name) = any (v_never);
  if v_bad > 0 then
    raise exception 'german synonyms: % ordinary-word synonym(s) from this vocabulary are active and would mis-expand ordinary queries', v_bad;
  end if;

  -- Outside that scope the same shape is reported and not enforced, so a
  -- pre-existing activation is visible in the deploy log without being able to
  -- block the queue.
  select count(*) into v_off
    from public.search_synonyms s
   where s.status = 'active'
     and exists (select 1 from unnest(s.terms) term where lower(term) = any (v_never))
     and (s.tag_alias_id is null or not exists (
       select 1 from public.tag_aliases a
        join public.unified_tags t on t.id = a.canonical_tag_id
       where a.id = s.tag_alias_id and t.category = 'Substances & Harm Reduction'));
  if v_off > 0 then
    raise notice 'german synonyms: % ordinary-word synonym(s) active OUTSIDE this vocabulary — not touched, worth a human look', v_off;
  end if;

  -- A silent no-op is the failure mode that produced this file, so it has to be
  -- caught — but "activated 0 rows" is the WRONG test, because on a re-apply
  -- every row is already active and the UPDATE legitimately matches nothing.
  -- Asserting on v_on would make this migration fail the second time it ran and
  -- block the queue behind it, which is the same trap as the scope question
  -- above. The right question is whether any work is left UNDONE: an
  -- activate-list alias still sitting at 'approved' means the update did not
  -- reach it. That is zero on a successful first run and zero on every re-run.
  select count(*) into v_bad
    from public.search_synonyms s
    join public.tag_aliases a on a.id = s.tag_alias_id
    join public.unified_tags t on t.id = a.canonical_tag_id
   where s.status = 'approved'
     and t.status = 'active'
     and lower(a.alias_name) = any (v_activate);
  if v_bad > 0 then
    raise exception 'german synonyms: % activate-list synonym(s) still approved after the update', v_bad;
  end if;

  raise notice 'german synonyms: % newly activated this run', v_on;
end
$mig$;
