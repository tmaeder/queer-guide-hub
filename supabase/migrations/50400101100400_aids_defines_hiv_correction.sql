-- `/tags/aids` DEFINED HIV. Both prose fields, on an ACTIVE, `seo_indexable`
-- row with 106 assignments, opened with the same sentence:
--
--     "The human immunodeficiency virus (HIV) is a retrovirus that attacks
--      the immune system..."
--
-- That is the definition of HIV, on the page for AIDS. Only the
-- `short_description` ("HIV can lead to AIDS without treatment") was about the
-- relationship between them at all.
--
-- THIS IS THE WRONG-SENSE CLASS, not the wrong-entity class, and neither
-- existing guard could catch it: `wikidata_id` and `wikipedia_url` are both
-- NULL on this row, so there is no identifier to be wrong and nothing for
-- `tag-wiki-guard.ts` to check. It was found by comparing the glossary against
-- seven HIV/STI references, which is the only thing that would have.
--
-- WHY IT MATTERS MORE THAN A TYPO. Conflating the virus with the syndrome is
-- the single most common error in HIV communication and the one all seven
-- sources take most care over; UNAIDS gives it a section, and `hiv` is a
-- separate live tag with 580 uses carrying the correct virus definition — so
-- the corpus said the same thing twice and the AIDS page said nothing.
-- Materially: a reader cannot learn from it that AIDS is a STAGE with
-- diagnostic criteria, that those criteria are an AIDS-defining condition OR a
-- CD4 count under 200 cells/mm3, or that with treatment the stage is now
-- uncommon and immune recovery is ordinary. The replacement is grounded in the
-- clinicalinfo.hiv.gov glossary read for this pass, which states the criteria
-- verbatim, and in the CDC glossary's "AIDS is the most advanced stage of HIV".
--
-- REPLACED, NOT RETRACTED — the `darkroom` rule. The row is ACTIVE and
-- rendering to 106 pieces of content, so a retraction leaves a live page blank
-- where a replacement leaves it correct. The prior text is recoverable from
-- `tag_change_log.before_data`, which is why content writes go through an
-- attributed actor.
--
-- CONTENT-GUARDED, so a human who fixes this first keeps their work: each
-- UPDATE fires only while the row still carries the defect's own signature.
--
-- SECOND ROW, SAME PASS: `hiv-aids-crisis` carries a `short_description` and a
-- `long_description` that are correctly about the crisis and its effect on
-- LGBTQ+ communities, over a `description` that is an encyclopaedic paragraph
-- on the virus's PHYLOGENY — "originated in non-human primates in Central and
-- West Africa ... HIV-1 subgroup M in Leopoldville in the Belgian Congo in the
-- 1920s". True, and not what that row is for. Only the wrong FIELD is replaced
-- (the `casting` / `trauma` / `watersports` rule); the two correct fields and
-- the row's `wikipedia_url` are untouched.
--
-- NOT DONE HERE, deliberately: `hiv-aids` (289 assignments across news and
-- venues) describes itself as "HIV/AIDS related news and research" — a topical
-- news facet rather than a definition, which is what it is actually used as.
-- UNAIDS prefers "HIV and AIDS" over "HIV/AIDS", so the NAME has a real
-- question against it, but renaming or merging a 289-assignment tag is an
-- editorial decision about the news taxonomy and not a prose correction.
-- Recorded rather than done quietly.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:aids-defines-hiv-correction', true);

do $mig$
declare
  v_n int;
begin
  update public.unified_tags set
    short_description = 'The most advanced stage of HIV infection, defined by specific criteria.',
    description =
'AIDS (acquired immunodeficiency syndrome) is the most advanced stage of HIV infection — a stage, not a separate virus. A person with HIV is diagnosed with AIDS when they have an AIDS-defining condition, or when their CD4 count falls below 200 cells/mm3 regardless of whether such a condition is present. Effective HIV treatment prevents that progression, and someone diagnosed at this stage can usually recover immune function on treatment.',
    long_description =
'AIDS stands for acquired immunodeficiency syndrome, and the distinction from HIV is the one worth getting right: HIV is the virus, AIDS is the most advanced stage of what that virus does if it goes untreated. Nobody catches AIDS, and nobody is an "AIDS patient" — a person has HIV, and AIDS describes how far it has progressed.

The diagnosis has specific criteria rather than being a judgement about how ill someone looks. A person living with HIV is classified as having AIDS when either an AIDS-defining condition is present — a set of opportunistic infections and cancers that an intact immune system would normally hold off — or their CD4 count drops below 200 cells per cubic millimetre, whichever comes first, and the CD4 criterion applies whether or not any such illness has appeared.

What has changed is how reachable the stage is. Effective antiretroviral treatment stops progression, so an AIDS diagnosis today mostly follows from HIV that went undiagnosed or untreated for years, and it is far more common where testing and medication are hard to reach than where they are not. The classification is also not a verdict: immune function usually recovers on treatment, CD4 counts climb back, and someone who once met the criteria can live an ordinary lifespan.

The two words are not interchangeable, and using them as though they were is how the stage gets mistaken for the diagnosis. HIV is what a test detects and what treatment suppresses; AIDS is a stage that treatment is designed to make sure nobody reaches.'
  where slug = 'aids'
    and status = 'active'
    and description like 'The human immunodeficiency virus (HIV) is a retrovirus%';
  get diagnostics v_n = row_count;
  raise notice 'aids correction: rewrote % row(s)', v_n;

  -- Only the wrong FIELD on the crisis row.
  update public.unified_tags set
    description =
'The years in which HIV moved through queer communities largely unanswered, and what those communities built in response. In much of the West the crisis is dated from 1981, and its defining feature was not only the illness but the neglect around it: slow official response, criminalisation and stigma, and care work organised by the people most affected — buddy systems, treatment activism, needle exchanges and the funerals nobody else would hold.'
  where slug = 'hiv-aids-crisis'
    and status = 'active'
    and description like 'AIDS is caused by a human immunodeficiency virus%';
end $mig$;

do $verify$
declare
  v_bad int;
begin
  -- The defect must be gone from BOTH fields, not just the one that is read first.
  select count(*) into v_bad from public.unified_tags
   where slug = 'aids'
     and (coalesce(description, '') like 'The human immunodeficiency virus (HIV) is a retrovirus%'
          or coalesce(long_description, '') like 'The human immunodeficiency virus (HIV) is a retrovirus%');
  if v_bad > 0 then
    raise exception 'verify: the AIDS page still opens by defining HIV';
  end if;

  -- And the replacement must actually teach the distinction it exists for.
  select count(*) into v_bad from public.unified_tags
   where slug = 'aids' and status = 'active'
     and coalesce(long_description, '') like '%CD4 count%'
     and coalesce(long_description, '') like '%200 cells%'
     and coalesce(description, '') like '%most advanced stage%';
  if v_bad <> 1 then
    raise exception 'verify: the AIDS page does not state the stage or its criteria';
  end if;

  -- A correction that leaves the page blank is not a correction.
  select count(*) into v_bad from public.unified_tags
   where slug in ('aids', 'hiv-aids-crisis')
     and status = 'active'
     and (coalesce(description, '') = '' or coalesce(long_description, '') = '');
  if v_bad > 0 then
    raise exception 'verify: % corrected row(s) are live with an empty field', v_bad;
  end if;

  -- `hiv` keeps the virus definition: this file moves prose OFF the wrong row,
  -- it does not take the right one away from the right row.
  select count(*) into v_bad from public.unified_tags
   where slug = 'hiv' and status = 'active' and coalesce(long_description, '') <> '';
  if v_bad <> 1 then
    raise exception 'verify: the HIV row lost its body';
  end if;

  -- The crisis row's other two fields and its link are untouched.
  select count(*) into v_bad from public.unified_tags
   where slug = 'hiv-aids-crisis'
     and short_description = 'Global health crisis affecting LGBTQ+ communities'
     and wikipedia_url is not null;
  if v_bad <> 1 then
    raise exception 'verify: the crisis row lost a field this migration does not own';
  end if;
end $verify$;
