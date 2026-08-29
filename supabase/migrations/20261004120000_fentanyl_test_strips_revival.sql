-- `fentanyl-test-strips` — the last of the three harm-reduction tools the
-- 2026-08-28 health audit flagged as deprecated and 404.
--
-- THE OTHER TWO NEEDED NOTHING, AND CHECKING FIRST IS THE POINT.
--
--   * `drug-checking` is already active, human-reviewed and live, with a
--     1,046-character entry and three citations — revived by the substance
--     vocabulary work that landed in 20261003110000..110500 while the audit was
--     being written. Re-adding it would have overwritten better prose than mine.
--   * `slamming` is NOT deprecated. It is `status='merged'` into
--     `safer-injecting`, /tags/slamming 301s there, and both "Slam" and
--     "Slamming" survive as synonym aliases so the word still finds the page and
--     still shows in "Also called". Reviving it would UNDO a deliberate
--     consolidation and split one concept across two pages.
--
-- So this migration covers one tag, not three.
--
-- WHY THIS ONE IS WORTH REVIVING. The audit's own finding was that fentanyl
-- contamination of drugs sold as something else is a leading cause of fatal
-- overdose, and `fentanyl` and `heroin` both now say so. A reader who follows
-- that to "what do I actually do about it" needs the tool, and it 404s.
--
-- THE STORED PROSE IS REPLACED, NOT KEPT. The existing description is
-- LLM-generated and hedges into advocacy ("Access to these strips is crucial for
-- promoting safety and health within the LGBTQ+ community and beyond") without
-- ever saying what the strips do, what they miss, or how to use one. The two
-- things a reader most needs are both limits:
--
--   1. A NEGATIVE RESULT IS NOT "SAFE". Strips test the portion dissolved, and
--      fentanyl distributes unevenly through a powder — the "chocolate chip
--      cookie" problem. A clean test on one part says nothing about the rest.
--   2. THEY DO NOT DETECT NITAZENES. This is the one that matters most right
--      now and is most often omitted: immunoassay strips are raised against
--      fentanyl and its analogues, and nitazenes are a structurally different
--      class. The audit already added `nitazenes` as a tag naming them as an
--      increasingly common adulterant, so a reader can arrive here believing a
--      negative strip rules out the thing it cannot see.
--
-- No dosing, no sourcing, no instructions beyond "test, and treat a positive as
-- information rather than a verdict" — the same line the rest of this
-- vocabulary holds, with the link out to the services that do that work.
--
-- `human_reviewed = true` is load-bearing twice, as everywhere in this family:
-- `deprecate_unused_tags()` prunes any active tag with zero usage and skips
-- human-reviewed rows (this tag has usage_count 0 and is exactly what that
-- sweep killed the first time), and `enforce_tag_seo_sensitivity_gate()` forces
-- `seo_indexable := false` on a sensitive row that is not human-reviewed.
-- `verification_status='reviewed'` is what lets `unified_tags_public_gated_read`
-- show a sensitive tag to an anonymous reader.

select set_config('app.actor', 'admin:fentanyl-test-strips-20260829', true);

do $mig$
declare
  v_cat_id uuid;
  v_tag_id uuid;
  v_rel_id uuid;
  a        text;
begin
  select id into strict v_cat_id from public.tag_categories where slug = 'substances-harm-reduction';

  update public.unified_tags
     set status              = 'active',
         description         =
'Paper strips that detect fentanyl in a dissolved sample of a drug. They are cheap, quick and genuinely useful — but a negative result is not a clean bill of health: fentanyl spreads unevenly through a powder, and the strips do not detect nitazenes at all.',
         long_description    =
'A fentanyl test strip is an immunoassay: dissolve a small amount of the drug in water, dip the strip, and read the line. It answers one narrow question — is there fentanyl or a close analogue in the part I dissolved.

Two limits decide how much a result is worth, and both cut against a negative.

Fentanyl does not mix evenly through a powder. It arrives in clumps, so one corner of a bag can be inert and another lethal — testing a pinch tells you about that pinch. This is why a negative strip is a reason to go slowly rather than a reason to relax, and why testing more of what you actually intend to take is worth the extra strip.

And the strips are raised against fentanyl and its analogues, so they do not see nitazenes, a structurally different family of synthetic opioids now turning up in the same supply and in some cases stronger still. A negative result says nothing about them.

What a positive result is worth is more straightforward: it tells you the batch contains something that kills at doses too small to see. That is information, not a verdict — and it is the point at which not using alone, starting far lower than usual, and having naloxone within reach stop being general advice and become specific to what is in front of you.

Drug-checking services test more thoroughly than any strip can, and are the better option wherever one is reachable.'
         ,
         short_description   = 'Paper strips that detect fentanyl in a dissolved sample of a drug.',
         is_sensitive        = true,
         sensitive_topics    = array['substance use','harm reduction'],
         verification_status = 'reviewed',
         human_reviewed      = true,
         seo_indexable       = true,
         merged_into_id      = null,
         deprecated_at       = null,
         deprecation_reason  = null,
         last_verified_at    = now(),
         updated_at          = now()
   where slug = 'fentanyl-test-strips';

  select id into strict v_tag_id from public.unified_tags where slug = 'fentanyl-test-strips';

  insert into public.tag_category_assignments (tag_id, category_id, is_primary)
  values (v_tag_id, v_cat_id, true)
  on conflict (tag_id, category_id) do update set is_primary = true;

  -- Related concepts, skipped rather than created when absent so this cannot
  -- mint a stub. `nitazenes` is the one that earns its edge: the entry says the
  -- strips cannot see them, and the reader should be able to get there.
  foreach a in array array['harm-reduction', 'drug-checking'] loop
    select id into v_rel_id from public.unified_tags where slug = a and status = 'active';
    if v_rel_id is not null and v_rel_id <> v_tag_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  foreach a in array array['fentanyl', 'nitazenes', 'naloxone'] loop
    select id into v_rel_id from public.unified_tags where slug = a and status = 'active';
    if v_rel_id is not null and v_rel_id <> v_tag_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_rel_id, 'related', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  -- "FTS" is deliberately NOT an alias: it collides with full-text search in
  -- this codebase's own vocabulary and is ambiguous to a reader.
  foreach a in array array['Fentanyl test strip', 'Fentanyl strips'] loop
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a)
         and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;
  end loop;

  insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, fetched_at, verified_at, is_public)
  select v_tag_id, 'editorial', u.url, u.claim, now(), now(), false
    from (values
      ('https://pmc.ncbi.nlm.nih.gov/articles/PMC12526229/',
       'Nitazenes as adulterants across the illicit opioid supply, and their potency range — the basis for saying strips raised against fentanyl do not cover them.'),
      ('https://www.cdc.gov/stop-overdose/caring/fentanyl-facts.html',
       'Fentanyl potency and its role in overdose deaths; uneven distribution through a supply.')
    ) as u(url, claim)
   where not exists (
     select 1 from public.tag_sources s where s.tag_id = v_tag_id and s.source_url = u.url);
end
$mig$;

do $verify$
declare v_n int;
begin
  select count(*) into v_n from public.unified_tags
   where slug = 'fentanyl-test-strips' and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked') and seo_indexable;
  if v_n <> 1 then
    raise exception 'fentanyl-test-strips: not publicly readable (matched % rows)', v_n;
  end if;

  select count(*) into v_n from public.tag_category_assignments ca
    join public.unified_tags t on t.id = ca.tag_id
    join public.tag_categories c on c.id = ca.category_id
   where t.slug = 'fentanyl-test-strips' and c.slug = 'substances-harm-reduction';
  if v_n <> 1 then
    raise exception 'fentanyl-test-strips: not filed under Substances & Harm Reduction';
  end if;

  -- The two limits are the reason this entry is safe to publish. A later edit
  -- that trims either one is a factual regression, not a copy change, so it
  -- fails here rather than reaching a reader.
  select count(*) into v_n from public.unified_tags
   where slug = 'fentanyl-test-strips'
     and coalesce(long_description,'') ~* 'nitazene'
     and coalesce(long_description,'') ~* 'unevenly|does not mix evenly';
  if v_n <> 1 then
    raise exception 'fentanyl-test-strips: prose must state the nitazene blind spot and uneven distribution';
  end if;

  -- The advocacy boilerplate this replaced, gone. Matches the OLD string, not
  -- the new phrasing — the ghb guard earlier in this audit tripped on its own
  -- correction by matching a phrase the fix legitimately quotes.
  select count(*) into v_n from public.unified_tags
   where slug = 'fentanyl-test-strips'
     and coalesce(description,'') ~* 'crucial for promoting safety';
  if v_n > 0 then
    raise exception 'fentanyl-test-strips: old advocacy description survived';
  end if;
end
$verify$;
