-- Health and trans-care glossary pages still age-gated by a leftover filing.
--
-- `unified_tags_recompute_is_adult()` marks a tag adult when ANY of its
-- tag_category_assignments rows sits in an adult category, primary or not.
-- Earlier passes re-filed these tags by writing `category_id`; the AFTER
-- trigger demotes the old primary junction row but leaves it in place, so a
-- stale Gear/Fetishes membership kept them behind "Adult content ahead":
--   gaff (Trans Health; stale Gear)                      — failed the prod
--     @smoke e2e/tags-trans-health.spec.ts on 2026-11-20
--   epididymitis, lymphogranuloma-venereum, pelvic-inflammatory-disease-pid,
--   sexual-function, libido (Sexual Health; stale Fetishes)
-- None of these is a kink/gear concept; the stale row carries no editorial
-- intent. Deleting it fires the recompute trigger, which clears is_adult.
--
-- Soft on preconditions (a row already gone is fine), hard on the end state.

select set_config('app.actor', 'migration:99991795181909_health_tags_drop_stale_adult_filings', true);

delete from public.tag_category_assignments a
using public.unified_tags t, public.tag_categories c
where a.tag_id = t.id
  and c.id = a.category_id
  and not a.is_primary
  and t.slug in ('gaff', 'epididymitis', 'lymphogranuloma-venereum',
                 'pelvic-inflammatory-disease-pid', 'sexual-function', 'libido')
  and c.name in ('Gear', 'Fetishes');

do $verify$
declare v_bad int; v_present int;
begin
  select count(*) into v_present from public.unified_tags
   where slug in ('gaff', 'epididymitis', 'lymphogranuloma-venereum',
                  'pelvic-inflammatory-disease-pid', 'sexual-function', 'libido');
  -- Positive control: the slugs exist (absent rows would make P1 vacuous).
  -- Soft: a CI snapshot may not carry all six.
  if v_present = 0 then
    raise notice 'health tag filings: none of the six slugs present (snapshot); nothing to verify';
    return;
  end if;

  -- P1: none of them is still adult-gated.
  select count(*) into v_bad from public.unified_tags
   where slug in ('gaff', 'epididymitis', 'lymphogranuloma-venereum',
                  'pelvic-inflammatory-disease-pid', 'sexual-function', 'libido')
     and is_adult;
  if v_bad <> 0 then
    raise exception 'health tag filings P1 failed: % tag(s) still is_adult', v_bad;
  end if;

  -- P2: each kept its primary filing (only the stale membership went).
  select count(*) into v_bad from public.unified_tags t
   where t.slug in ('gaff', 'epididymitis', 'lymphogranuloma-venereum',
                    'pelvic-inflammatory-disease-pid', 'sexual-function', 'libido')
     and not exists (select 1 from public.tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary);
  if v_bad <> 0 then
    raise exception 'health tag filings P2 failed: % tag(s) lost their primary category', v_bad;
  end if;
end
$verify$;
