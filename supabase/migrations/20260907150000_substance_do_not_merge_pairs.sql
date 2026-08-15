-- Do-not-merge pairs for name-similar but pharmacologically distinct substances.
--
-- The substance vocabulary is full of near-identical slugs that are NOT the same
-- drug. Measured across the active tags now filed under Substances & Harm
-- Reduction, these are every pair scoring >= 0.5 trigram similarity:
--
--   dexamphetamine   / amphetamine      0.588
--   synthetic-cannabinoids / cannabinoids  0.565
--   alprazolam       / flualprazolam    0.563
--   methamphetamine  / amphetamine      0.556
--   3-mmc            / 2-mmc            0.500
--
-- None of them can auto-merge today: `refresh_tag_merge_candidates` defaults to
-- `p_min_similarity = 0.90` and `tag_slugs_are_variants` returns false for all
-- five. So this migration changes no behaviour right now, and that is the point
-- — it is a latch, not a fix.
--
-- WHY LATCH IT ANYWAY
--
-- The failure is asymmetric. Every other duplicate in this vocabulary is a
-- spelling of one drug, so a wrong merge is cosmetic and reversible via
-- `unmerge_tag_concept`. These five are different molecules with different
-- risk profiles, and the merge would silently move assignments and stand up a
-- slug redirect — so a reader following an old /tags/2-mmc link would land on a
-- page about a different substance, with different harm-reduction guidance,
-- and nothing on the page would say so. On a harm-reduction surface that is a
-- safety defect, not a data-quality one.
--
-- Two realistic ways it fires without anyone intending it: someone lowers
-- `p_min_similarity` (0.588 is not far), or a human clicks approve in the merge
-- queue on a pair that looks like a typo. `merge_tag_concept` checks
-- `tag_relationship_exclusions` before doing anything and raises
-- 'pair is a do-not-merge exclusion', which blocks BOTH routes at the core
-- rather than at whichever caller happens to be in fashion.
--
-- Deliberately NOT exhaustive-by-rule. "Any two substance tags may never merge"
-- would be wrong — the import merged 17 genuine duplicates inside this very
-- category (valium/diazepam, crystal-meth/methamphetamine). The distinction is
-- pharmacological, not lexical, so the list is curated and stays curated.

insert into public.tag_relationship_exclusions (tag1_id, tag2_id, reason)
select least(a.id, b.id), greatest(a.id, b.id),
       'distinct substances with similar names — merging misstates harm-reduction guidance'
from (values
    ('dexamphetamine',         'amphetamine'),
    ('methamphetamine',        'amphetamine'),
    ('synthetic-cannabinoids', 'cannabinoids'),
    ('alprazolam',             'flualprazolam'),
    ('3-mmc',                  '2-mmc'),
    -- Not in the >=0.5 band, but the same class of error and the same cost:
    ('mdma',                   'mda-mdea-mbdb'),
    ('methylone',              'methcathinone'),
    ('codeine',                'oxycodone'),
    ('morphine',               'diacetylmorphine'),
    ('diazepam',               'midazolam'),
    ('lorazepam',              'oxazepam')
  ) as p(s1, s2)
join public.unified_tags a on a.slug = p.s1
join public.unified_tags b on b.slug = p.s2
where a.id <> b.id
on conflict (tag1_id, tag2_id) do nothing;

do $verify$
declare v_a uuid; v_b uuid; v_ok boolean := false;
begin
  select id into v_a from public.unified_tags where slug = '2-mmc';
  select id into v_b from public.unified_tags where slug = '3-mmc';
  if v_a is null or v_b is null then
    raise exception 'substance do-not-merge: 2-mmc/3-mmc missing';
  end if;

  -- Prove the latch actually blocks the merge core, rather than trusting that a
  -- row in a table is consulted.
  begin
    perform public.merge_tag_concept(v_a, v_b, 'admin:exclusion-verify', 'verify');
  exception when others then
    if sqlerrm like '%do-not-merge exclusion%' then v_ok := true; else raise; end if;
  end;

  if not v_ok then
    raise exception 'substance do-not-merge: 2-mmc/3-mmc merged despite the exclusion';
  end if;
end
$verify$;
