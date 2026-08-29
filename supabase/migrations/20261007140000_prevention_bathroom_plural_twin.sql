-- LGBTQA+ suicide prevention, follow-up: the one twin the family created.
--
-- 20261007120200 minted `gender-neutral-bathroom` for the guideline's risk
-- factor "access to gender-appropriate bathrooms". `gender-neutral-bathrooms`
-- — plural, created 2026-04-26, active, 2 assignments — already existed, and
-- for a few hours the glossary published two pages for one concept.
--
-- WHY THE FAMILY DID NOT CATCH IT. Every create in that file is
-- `on conflict (slug) do update`, which is a guard against a row at THE SAME
-- SLUG and nothing else. Part 2's header is explicit that publishing one
-- concept under two slugs is the thing to avoid — it dropped `dysphoria` for
-- exactly that reason — but the check that enforced it was performed by hand,
-- against `duplicate_active_name`, and that metric compares NAMES: "Gender-
-- Neutral Bathroom" and "Gender-Neutral Bathrooms" differ by one character, so
-- the ratchet sat at its baseline of 14 through the whole change and reported
-- nothing. A new slug has to be checked against the plural neighbourhood, not
-- just against itself. It was found by searching the live site for the new
-- term and reading what came back beside it.
--
-- DIRECTION: plural folds into singular, which is both the dictionary form and
-- what `run_tag_plural_merge` (cron `tag_plural_merge`, 25 4 * * *) would have
-- done unattended tonight — `tag_plural_pairs` returns (singular, plural) and
-- the runner calls `merge_tag_concept(singular_id, plural_id)`, so the singular
-- is always canonical. Doing it here rather than letting the cron do it is not
-- belt-and-braces: an unattended merge of a row this file's own family created
-- hours earlier should be a decision on the record, and the repo's standing
-- rule is to prove a merge job's behaviour rather than wait for it. After this
-- runs the cron finds the pair already resolved and does nothing.
--
-- The singular is also the better row on the merits, which is why the
-- direction is not merely conventional: it is human_reviewed with prose written
-- for it, and it sits in `safe-spaces` (Venue Features & Policies) — a bathroom
-- policy is a venue feature — where the plural sat in `gender-identity`, a
-- concept stop, under the retired v2 filing.
--
-- merge_tag_concept moves assignments, mints the synonym alias, and
-- trg_unified_tags_merge_redirect files the 301 against the canonical on the
-- status flip. All three are asserted below rather than assumed: the redirect
-- in particular is the one that has been silently absent before (see
-- 20260802111403), and a merge that leaves /tags/gender-neutral-bathrooms
-- 404ing costs the 2 entities their inbound link.
--
-- app.actor must not match 'system:%' — log_unified_tag_change() raises when a
-- human_reviewed row is changed by a system actor, and both rows are now one.

select set_config('app.actor', 'admin:lgbtqa-prevention-twin-20260829', true);

do $mig$
declare
  v_canon uuid;
  v_dup   uuid;
begin
  select id into v_canon from public.unified_tags
   where slug = 'gender-neutral-bathroom' and status = 'active';
  select id into v_dup from public.unified_tags
   where slug = 'gender-neutral-bathrooms' and status <> 'merged';

  -- Both arms are skips, not failures: re-running after the cron has already
  -- resolved the pair must be a no-op rather than an error.
  if v_canon is null or v_dup is null then
    raise notice 'prevention-twin: nothing to merge (canonical=%, duplicate=%)', v_canon, v_dup;
    return;
  end if;

  perform public.merge_tag_concept(v_canon, v_dup,
    'lgbtqa-prevention-twin', 'plural of gender-neutral-bathroom, created 2026-04-26');
end
$mig$;

do $verify$
declare v_n int;
begin
  -- One live page, not two.
  select count(*) into v_n from public.unified_tags
   where slug in ('gender-neutral-bathroom','gender-neutral-bathrooms') and status = 'active';
  if v_n <> 1 then
    raise exception 'prevention-twin: expected 1 active bathroom tag, found %', v_n;
  end if;

  -- And it is the singular that survived, pointed at by the plural.
  select count(*) into v_n from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'gender-neutral-bathrooms' and d.status = 'merged'
     and c.slug = 'gender-neutral-bathroom' and c.status = 'active';
  if v_n <> 1 then
    raise exception 'prevention-twin: the plural did not merge into the singular';
  end if;

  -- The assignments came across. Asserting only the merge would pass while the
  -- two entities that carried the plural lost their tag entirely.
  select count(*) into v_n from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id
   where t.slug = 'gender-neutral-bathroom';
  if v_n < 2 then
    raise exception 'prevention-twin: canonical carries % assignment(s), expected at least 2', v_n;
  end if;

  -- /tags/gender-neutral-bathrooms must resolve, and resolve to an ACTIVE tag:
  -- resolve_tag_slug filters the target on status, so a redirect filed against
  -- the merged row is a 404 in one hop and moves redirect_to_non_canonical off
  -- its baseline.
  select count(*) into v_n from public.tag_slug_redirects rd
    join public.unified_tags t on t.id = rd.tag_id
   where rd.old_slug = 'gender-neutral-bathrooms'
     and rd.new_slug = 'gender-neutral-bathroom'
     and t.status = 'active';
  if v_n <> 1 then
    raise exception 'prevention-twin: the plural has no redirect filed against an active tag';
  end if;

  -- The reason the file exists: the nightly cron must now find nothing here.
  -- If this fails, the pair is still live and the merge did not take.
  select count(*) into v_n from public.tag_plural_pairs(500)
   where plural_slug = 'gender-neutral-bathrooms';
  if v_n <> 0 then
    raise exception 'prevention-twin: tag_plural_pairs still offers the pair';
  end if;

  -- And no OTHER tag this family created has a plural twin left standing. This
  -- is the check that was missing when the family was written, so it is written
  -- down here rather than performed once by hand.
  select count(*) into v_n
    from public.tag_plural_pairs(500) p
   where p.singular_id in (select s.tag_id from public.tag_sources s
                            where s.source_id = 'lgbtqa-prevention-2022')
      or p.plural_id   in (select s.tag_id from public.tag_sources s
                            where s.source_id = 'lgbtqa-prevention-2022');
  if v_n <> 0 then
    raise exception 'prevention-twin: % prevention tag(s) still have a plural twin', v_n;
  end if;
end
$verify$;
