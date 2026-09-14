-- Seven HIV/STI clinical references compared against the glossary:
--
--   CDC "HIV Terms and Definitions"           (Wayback 2024 snapshot — see below)
--   CDC "Terms and Abbreviations", STI Rx      (Wayback 20251222022208)
--   clinicalinfo.hiv.gov HIV/AIDS Glossary PDF (Wayback; 133pp, ~875 headwords)
--   aidsmap glossary                           (live; 834 headwords)
--   UNAIDS 2024 Terminology Guidelines PDF     (live)
--   PHAC "Sexually Transmitted Infections"     (live; 100pp)
--   WHO STI fact sheet                         (live)
--
-- READ THE SOURCE-ACCESS NOTE BEFORE RE-RUNNING THIS COMPARISON. www.cdc.gov
-- and clinicalinfo.hiv.gov refuse this egress outright (403 to curl, to the
-- r.jina.ai text proxy, and to headless Chromium, which draws Cloudflare's
-- "Just a moment..." interstitial). It is THEIR block and not our environment,
-- and the thing that proves it is a sibling host: npin.cdc.gov answers 200 from
-- the same egress in the same minute, and the proxy reports
-- `bundleCoversEveryHost: true`. The three were read from the Internet Archive
-- instead (`https://web.archive.org/web/<year>id_/<url>` — the `id_` RAW form;
-- the ordinary replay form and the availability API both fail here, the latter
-- with 429). So those three are a SNAPSHOT, not today's page, and the CDC HIV
-- glossary specifically is the 2024 capture because the 2025 one archived CDC's
-- own 403. Anything this pass attributes to them is as of those dates.
--
-- This file is the CORRECTIONS half: every row it touches is ALREADY LIVE, so
-- each defect below is on a page a reader can open today.
--
-- 1. TWO ACTIVE, INDEXABLE STI PAGES ARE FILED UNDER `Fetishes`.
--
--      pelvic-inflammatory-disease   Fetishes -> Sexual Health
--      lymphogranuloma-venereum      Fetishes -> Sexual Health
--
--    PID is what untreated chlamydia or gonorrhoea becomes, and the leading
--    preventable cause of infertility and ectopic pregnancy; LGV is a chlamydia
--    serovar whose current European epidemiology is almost entirely among men
--    who have sex with men, and the WHO fact sheet read for this pass names it
--    among the "re-emerging neglected STIs". Publishing either as a FETISH is
--    not a tidiness problem: it files a diagnosis as a kink, on the platform
--    least able to afford that confusion, and both rows are `seo_indexable`.
--    (`epididymitis` and `sti-screening` sit under Fetishes too; both are
--    deprecated, so they are repaired by the revival file, not here.)
--
--    THE CATEGORY IS MOVED BY WRITING `category_id` ALONE. `sync_tag_category`
--    (BEFORE) derives the TEXT from it and `sync_tag_category_after` (AFTER
--    UPDATE OF category_id) moves the primary junction row, and the junction is
--    what `/tags/:slug` renders (20261006110000 is the precedent). Writing the
--    text by hand instead fires NO trigger at all and moves no page.
--
-- 2. THREE ACTIVE, INDEXABLE ROWS PUBLISH NO BODY AT ALL — `mpox` (39 uses),
--    `shigella` and `hepatitis-a`. Each already carries a good, queer-specific
--    `description`; only `long_description` is empty, so `/tags/mpox` renders
--    two sentences and stops. Filling a NULL is not the LLM rewrite this repo
--    retired (20261012090100): nothing is destroyed, the UPDATE is guarded on
--    emptiness, and the existing summary is left exactly as it is.
--
--    `human_reviewed` is deliberately NOT set to false on these rows even
--    though a machine wrote the new body. `deprecate_unused_tags` selects
--    exactly `status='active' AND human_reviewed=false AND usage_count=0`, and
--    `shigella` and `hepatitis-a` would qualify — stamping the honest flag
--    would queue the pages for deletion. `prose_reviewed_at` is the signal that
--    costs nothing, it is already NULL on all three, and they were already
--    counted by `tag_hygiene_stats().prose_unreviewed`. (20360101101300's rule,
--    verbatim: check what CONSUMES a flag before setting it truthfully.)
--
--    mpox is the one worth explaining. A merged `monkeypox` row still holds a
--    416-character body, so the obvious move is to lift it across — and that is
--    REFUSED here. That text is generic zoonosis prose ("a rare viral zoonotic
--    disease ... belongs to the same family"), it never mentions sex, and WHO
--    renamed the disease in 2022 precisely because the old name carried racist
--    and stigmatising associations. Recovering it would re-import both the
--    framing and the name. The body written here is grounded in the WHO fact
--    sheet and the CDC material read for this pass.
--
-- 3. OUR OWN PROSE SAYS "sexually transmitted DISEASE" ON TWO ROWS while the
--    canonical tag is `sti` and the UNAIDS guidelines list "sexually
--    transmitted disease" and "venereal disease" under Do Not Use. One word,
--    substituted in place, on `genital-warts` and `lymphogranuloma-venereum`.
--
-- 4. `aids-related-complex` PUBLISHES "the HIV virus" — the V already stands
--    for virus. Also a UNAIDS Do-Not-Use entry ("HIV virus" / "AIDS virus").
--    Only that phrase is touched. The rest of that row is weak in ways this
--    file deliberately does not fix (it closes "It is considered a human
--    disease.", a Wikidata-description artefact of the same family as
--    `methadone`'s "group of stereoisomers"), because a full rewrite of a live
--    body is its own change with its own review.
--
-- 5. `pelvic-inflammatory-disease` says "an infection of the female
--    reproductive organs". Naming the organs is both more precise and correct
--    for the trans men and non-binary people who get PID and who are readers
--    here. This IS a small deliberate rewrite rather than a null fill, and is
--    stated rather than folded in silently.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:hiv-sti-glossary-corrections', true);

do $mig$
declare
  v_sexual uuid;
  v_n      int;
begin
  select id into v_sexual from public.tag_categories where slug = 'sexual-health';
  if v_sexual is null then
    raise exception 'corrections: the Sexual Health category does not exist';
  end if;

  --------------------------------------------------------- 1. the two misfilings
  update public.unified_tags t
     set category_id = v_sexual
   where t.slug in ('pelvic-inflammatory-disease', 'lymphogranuloma-venereum')
     and t.status = 'active'
     and t.category_id is distinct from v_sexual;
  get diagnostics v_n = row_count;
  raise notice 'corrections: refiled % row(s) out of Fetishes', v_n;

  ------------------------------------------------------------ 2. the empty bodies
  update public.unified_tags set long_description =
'Mpox is a viral infection that produces fever, swollen lymph nodes and a rash that turns into firm, deep-seated blisters and sores. It is not formally an STI, and the distinction matters less than it sounds: the 2022 global outbreak moved through sexual networks of men who have sex with men because the virus passes on prolonged skin-to-skin contact, and sex is the most reliable way people have prolonged skin-to-skin contact with someone new.

What it looks like in practice is worth knowing, because it does not always look like the textbook. Sores often appear first exactly where contact happened — genitals, perineum, inside the anus, in the mouth or throat — rather than starting on the face and spreading, and there may be only a handful of them, or one. Anal or rectal pain severe enough to be mistaken for something else is a common presentation. The illness usually resolves over two to four weeks; it can be genuinely serious for people with advanced HIV or otherwise weakened immune systems.

A two-dose vaccine exists and is the practical point of this entry. It is offered free or at low cost in many countries to people at higher exposure, which in most national programmes explicitly includes gay and bisexual men and other men who have sex with men — worth arranging before travel rather than during an outbreak, since the second dose takes weeks. Covering the sores and avoiding sex while they heal is what interrupts onward transmission.

The name is deliberate. WHO renamed the disease from "monkeypox" in 2022 because the old name was being used in racist and stigmatising ways, and because the animal it names was never the source.'
   where slug = 'mpox' and status = 'active' and coalesce(long_description, '') = '';

  update public.unified_tags set long_description =
'Shigella is a gut bacterium that causes shigellosis: cramping, urgent and often bloody diarrhoea, and fever, usually starting one to three days after exposure. It takes a remarkably small dose to infect someone — far less than most foodborne bacteria — which is why it moves between sexual partners at all.

The sexual route is oral-anal contact, directly through rimming or indirectly via fingers, fists, toys or shared lube. Outbreaks have circulated among men who have sex with men for years, and the WHO now lists it among the infections newly recognised as sexually transmissible. Several circulating strains are resistant to the antibiotics that would once have been prescribed, so a culture that identifies which one it is changes the treatment rather than merely confirming the diagnosis.

Practically: it is diagnosed from a stool sample, and only if someone asks for one, so say how you think you were exposed — a clinician not told about rimming will reasonably look for food poisoning or travel. Most healthy people recover with fluids and without antibiotics. Someone is still infectious for a period after symptoms stop, which is the part usually missed, and washing hands, changing gloves and not sharing toys through that window is what stops it moving on.'
   where slug = 'shigella' and status = 'active' and coalesce(long_description, '') = '';

  update public.unified_tags set long_description =
'Hepatitis A is a viral infection of the liver. It causes fatigue, nausea, stomach pain, dark urine and often jaundice, and it can lay someone out for several weeks — but unlike hepatitis B and C it does not become chronic, and recovery is usually complete and confers lifelong immunity.

It spreads by the faecal-oral route, which in a sexual context means rimming above all, plus fingers, fists and anything shared between an anus and a mouth. Large outbreaks among men who have sex with men were recorded across Europe and North America from 2016 onwards, which is why it belongs in a sexual-health glossary at all rather than only a travel one.

There is a safe, effective vaccine, usually two doses, and it is the whole point of the entry: most national programmes recommend it specifically for gay, bisexual and other men who have sex with men, often alongside hepatitis B, and it is frequently free at a sexual-health clinic. It is also a standard travel vaccine for much of the world, so one course commonly covers both reasons at once. There is no specific treatment once infected — the illness is managed by resting and waiting it out — which is what makes vaccinating beforehand the only real intervention.'
   where slug = 'hepatitis-a' and status = 'active' and coalesce(long_description, '') = '';

  ---------------------------------------------- 3. "disease" -> "infection"
  update public.unified_tags
     set short_description = replace(short_description, 'Sexually transmitted disease', 'Sexually transmitted infection')
   where slug in ('genital-warts', 'lymphogranuloma-venereum')
     and short_description like '%Sexually transmitted disease%';

  update public.unified_tags
     set long_description = replace(long_description, 'sexually transmitted disease', 'sexually transmitted infection')
   where slug = 'genital-warts'
     and long_description like '%sexually transmitted disease%';

  ------------------------------------------------------- 4. "the HIV virus"
  update public.unified_tags
     set long_description = replace(long_description, 'the HIV virus', 'HIV')
   where slug = 'aids-related-complex'
     and long_description like '%the HIV virus%';

  ------------------------------------------------- 5. name the organs on PID
  update public.unified_tags
     set long_description = replace(long_description,
           'an infection of the female reproductive organs',
           'an infection of the uterus, fallopian tubes and ovaries')
   where slug = 'pelvic-inflammatory-disease'
     and long_description like '%an infection of the female reproductive organs%';
end $mig$;

-- Postconditions: the state this file exists to reach, re-asserted.
do $verify$
declare
  v_bad int;
begin
  -- ALL THREE category representations must agree, not just the lever.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.slug in ('pelvic-inflammatory-disease', 'lymphogranuloma-venereum')
     and (c.slug <> 'sexual-health'
          or coalesce(t.category, '') <> c.name
          or not exists (select 1 from public.tag_category_assignments a
                          where a.tag_id = t.id and a.is_primary and a.category_id = t.category_id));
  if v_bad > 0 then
    raise exception 'verify: % STI row(s) did not land in Sexual Health on all three representations', v_bad;
  end if;

  -- No STI page may still be published as a fetish.
  select count(*) into v_bad from public.unified_tags
   where slug in ('pelvic-inflammatory-disease', 'lymphogranuloma-venereum') and category = 'Fetishes';
  if v_bad > 0 then
    raise exception 'verify: an STI page is still filed under Fetishes';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('mpox', 'shigella', 'hepatitis-a')
     and status = 'active' and coalesce(long_description, '') = '';
  if v_bad > 0 then
    raise exception 'verify: % active row(s) still publish no body', v_bad;
  end if;

  -- The three filled rows must NOT have been re-flagged for the deletion sweep.
  select count(*) into v_bad from public.unified_tags
   where slug in ('mpox', 'shigella', 'hepatitis-a')
     and status = 'active' and not human_reviewed and usage_count = 0;
  if v_bad > 0 then
    raise exception 'verify: % filled row(s) are now selectable by deprecate_unused_tags', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where (slug in ('genital-warts', 'lymphogranuloma-venereum')
          and coalesce(short_description, '') ilike '%sexually transmitted disease%')
      or (slug = 'aids-related-complex' and coalesce(long_description, '') like '%the HIV virus%');
  if v_bad > 0 then
    raise exception 'verify: % row(s) still publish a UNAIDS do-not-use phrase', v_bad;
  end if;
end $verify$;
