-- The REVIVAL half of the seven-source HIV/STI comparison (sources and the
-- Internet-Archive access note are in 50400101100000's header).
--
-- Of the 432 rows in the glossary matching an HIV/STI pattern, 157 are active
-- and 258 are DEPRECATED — and the deprecated side is where the field's core
-- vocabulary turned out to be. Same two sweeps as every previous pass,
-- `auto: zero usage` and the 2026-06-05 orphan audit, whose premises this file
-- has now recorded as false for a glossary term four separate times.
--
-- What was holding:
--
--   viral-load               the quantity U=U, treatment and monitoring are all
--                            defined in terms of. `viral-load-monitoring` was
--                            live while the thing being monitored was not.
--   viral-suppression        the state U=U depends on.
--   seroconversion           the event a window period ends at.
--   serodiscordant           a couple with different HIV statuses — the single
--                            most common real-world PrEP conversation.
--   opportunistic-infections what an AIDS diagnosis actually consists of.
--   syphilis staging         primary / secondary / early / late / tertiary, all
--                            five, while `syphilis` itself stayed live. Staging
--                            is what treatment turns on, so a page that cannot
--                            say which stage is a page that cannot help.
--   dental-dam               the only barrier for oral-vaginal and oral-anal
--                            sex, i.e. the one that matters most to the readers
--                            least served by condom advice.
--   pubic-lice, molluscum-contagiosum, chancroid, candidiasis, herpes,
--   anal-warts, epididymitis, anal-cancer-screening, the testing vocabulary.
--
-- 32 of these 40 were `seo_indexable = true` WHILE deprecated, so clearing
-- `status` without clearing that flag publishes an unreviewed machine-written
-- body to crawlers the moment the row goes active. Everything revives
-- UNPUBLISHED, with its existing prose UNCHANGED.
--
-- HPV IS THE ONE TO READ TWICE, because it is not a revival so much as a
-- structural repair. The glossary holds FIVE HPV rows and, before this file,
-- not one of them rendered:
--
--     hpv                        deprecated   (351-char body)
--     hpv-human-papillomavirus   MERGED INTO `hpv`
--     human-papillomavirus-hpv   deprecated
--     genital-warts-hpv          deprecated
--     hpv-vaccination            deprecated   (1,355-char description)
--
-- `genital-warts` — a SYMPTOM of HPV — was the only live row in the family.
-- So on an LGBTQ+ health platform, the virus that causes almost all anal
-- cancer, the cancer whose risk is most elevated in men who have sex with men
-- and highest of all in men living with HIV, had no page, while the wart it
-- sometimes causes did. Reviving `hpv` is also what makes the merge above
-- resolve, which is the next finding.
--
-- A MERGE TARGET MUST BE ACTIVE, AND NOTHING ANYWHERE CHECKS THAT. A merge
-- mints a redirect from the loser's slug to the winner's page, so a winner that
-- is deprecated or itself merged is a redirect to a page that does not render.
-- Measured corpus-wide: of 289 merges, **8 point at a deprecated row and 5 at
-- another merged row**. This was found by following ONE term — `hpv` — which is
-- the argument for a standing counter rather than another hand-audit. The
-- counter is NOT in this file: it is `tag_merge_graph_signals()`, added by
-- 50400101100300, because restating `tag_hygiene_stats()`'s 210-line body to
-- add a key is a merge-collision surface (the reason `glossary_link_signals`
-- and the news/venue/event signals are all separate functions).
--
-- Seven are repaired here. The five merged->merged chains are collapsed to
-- their terminal target, which is mechanical and safe because every one of them
-- resolves to an ACTIVE row in a single hop (coffee-bar -> cafe,
-- enby-slang-for-non-binary -> non-binary, night-clubs and nightclubs ->
-- nightclub, step--brother -> stepbrother). `hpv` is fixed by the revival
-- above, and `sexually-transmitted-infections-stis` is repointed off the
-- deprecated `sexually-transmitted-infection` onto the live `sti` (95 uses),
-- which is where 50100101100000 already sent `stis-stds`.
--
-- SIX ARE DELIBERATELY LEFT, NAMED RATHER THAN SILENTLY COUNTED, because each
-- needs an editorial decision on a row outside this pass's subject:
-- `fluctuating/evolving`, `sensation-stimulation-devices`, `projector`, and the
-- three mojibake person slugs `jan-mikolasek`, `kirsten-plotz`, `preistrager`
-- (all three targets carry no body at all). So the counter splits: the
-- STRUCTURAL keys (a chain, a dangling uuid, a self-merge) gate at zero because
-- this file drives them there, while `target_deprecated` only WARNS and prints
-- the six pairs. A hard check that is red the day it ships is the cry-wolf
-- shape this repo already removed once from the dedup backlog rule.
--
-- NOT REVIVED, each measured rather than assumed:
--   serosorting      already an APPROVED alias of the active `seroadaptation`.
--                    It was never a gap, and `tag_reject_alias_shadow()` would
--                    refuse the revive anyway. A future comparison must not
--                    re-propose it — the `pinkwashing` lesson.
--   female-condom    reviving it would publish outdated gendered terminology.
--                    `condom-internal` is the current term and is revived
--                    instead, with `condom-external` for the pair.
--   hepatitis        `hepatitis-a`, `-b` and `-c` are all live; an umbrella row
--                    adds a page that duplicates three.
--   vaccine          `vaccination` is live.
--   sti-std, stis, sti-std-prevention, sexually-transmitted-infection,
--   human-papillomavirus-hpv, genital-warts-hpv, pelvic-inflammatory-disease-pid,
--   post-exposure-prophylaxis-pep, pre-exposure-prophylaxis-prep
--                    spelled-out, pluralised or acronym-suffixed duplicates of
--                    a row that is live or becomes live here. They are alias
--                    candidates, NOT terms — but each occupies a real tag slug,
--                    so an alias would be refused by the shadow guard. Merging
--                    them is the right tool and is its own change.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:hiv-sti-vocabulary-revivals', true);

-- `rec`, not `r`: PL/pgSQL resolves a qualified name to a DECLAREd variable
-- before a table alias (20360101101600).
do $mig$
declare
  rec   record;
  v_bad int;
  v_n   int := 0;
begin
  create temp table _revive (slug text primary key, cat text) on commit drop;

  insert into _revive (slug, cat) values
    ('anal-cancer-screening',          'sexual-health'),
    ('anal-warts',                     'sexual-health'),
    ('candidiasis',                    'sexual-health'),
    ('chancroid',                      'sexual-health'),
    ('condom-external',                'consent-negotiation'),
    ('condom-internal',                'consent-negotiation'),
    ('condom-negotiation',             'consent-negotiation'),
    ('condomless',                     'sexual-health'),
    ('dental-dam',                     'sexual-health'),
    ('drug-substitution-therapy',      'substances-harm-reduction'),
    ('early-syphilis',                 'sexual-health'),
    ('epididymitis',                   'sexual-health'),
    ('herpes',                         'sexual-health'),
    ('hpv',                            'sexual-health'),
    ('hpv-vaccination',                'sexual-health'),
    ('late-syphilis',                  'sexual-health'),
    ('molluscum-contagiosum',          'sexual-health'),
    ('needle-exchange-program-nep',    'substances-harm-reduction'),
    ('opportunistic-infections',       'sexual-health'),
    ('oral-candidiasis-thrush',        'sexual-health'),
    ('papanicolaou-test-pap-test',     'sexual-health'),
    ('prep-adherence',                 'sexual-health'),
    ('prep-resistant-hiv',             'sexual-health'),
    ('primary-syphilis',               'sexual-health'),
    ('pubic-lice',                     'sexual-health'),
    ('resistance-testing',             'sexual-health'),
    ('secondary-syphilis',             'sexual-health'),
    ('serodiscordant',                 'sexual-health'),
    ('serological-test',               'sexual-health'),
    ('seroconversion',                 'sexual-health'),
    ('seroprevalence',                 'sexual-health'),
    ('sexual-health-screening',        'sexual-health'),
    ('sti-testing',                    'sexual-health'),
    ('supervised-injection-site',      'substances-harm-reduction'),
    ('tertiary-syphilis',              'sexual-health'),
    ('test-of-cure',                   'sexual-health'),
    ('test-of-reinfection',            'sexual-health'),
    ('treponemal-test',                'sexual-health'),
    ('viral-load',                     'sexual-health'),
    ('viral-suppression',              'sexual-health');

  ---------------------------------------------------------------- guards
  -- SOFT on preconditions, HARD on postconditions (20360401100100). Every
  -- check reports and then EXCLUDES; a concurrent session that revives or
  -- merges one of these must not abort `db push` on main and block every
  -- migration queued behind it.
  select count(*) into v_bad from _revive rv
   where exists (select 1 from public.unified_tags t where t.slug = rv.slug and t.status = 'active');
  if v_bad > 0 then
    raise notice 'hiv/sti revivals: % row(s) already active — skipped', v_bad;
  end if;

  select count(*) into v_bad from _revive rv
   where exists (select 1 from public.tag_aliases a where a.alias_slug = rv.slug);
  if v_bad > 0 then
    raise notice 'hiv/sti revivals: % slug(s) are alias-shadowed — skipped, see header', v_bad;
  end if;

  -- A category slug that does not exist is a typo in THIS file and no later
  -- corpus state repairs it: hard.
  select count(*) into v_bad from _revive rv
   where not exists (select 1 from public.tag_categories c where c.slug = rv.cat);
  if v_bad > 0 then
    raise exception 'hiv/sti revivals: % row(s) name a category that does not exist', v_bad;
  end if;

  ---------------------------------------------------------------- revive
  for rec in
    select rv.* from _revive rv
      join public.unified_tags t on t.slug = rv.slug
     where t.status = 'deprecated'
       and t.merged_into_id is null
       and coalesce(t.long_description, '') <> ''
       and not exists (select 1 from public.tag_aliases a where a.alias_slug = rv.slug)
     order by rv.slug
  loop
    update public.unified_tags t set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = false,
      human_reviewed      = false,
      verification_status = 'unverified',
      category_id         = (select c.id from public.tag_categories c where c.slug = rec.cat)
    where t.slug = rec.slug;
    v_n := v_n + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Revived unpublished. Culled by a sweep keyed on zero usage or on having no entity assignments, neither of which is evidence about a glossary term. Corroborated against the CDC, clinicalinfo.hiv.gov, aidsmap, UNAIDS, PHAC and WHO HIV/STI references. Existing body kept unchanged and unreviewed; it predates this migration.',
           false
      from public.unified_tags t where t.slug = rec.slug;
  end loop;
  raise notice 'hiv/sti revivals: revived % row(s)', v_n;

  ------------------------------------------- merge targets that do not render
  -- (a) collapse merged -> merged chains onto their terminal target.
  update public.unified_tags t
     set merged_into_id = m2.id
    from public.unified_tags m
    join public.unified_tags m2 on m2.id = m.merged_into_id
   where t.merged_into_id = m.id
     and m.status = 'merged'
     and m2.status = 'active';
  get diagnostics v_bad = row_count;
  raise notice 'hiv/sti revivals: collapsed % merge chain(s)', v_bad;

  -- (b) the STI spelled-out form pointed at a DEPRECATED row; `sti` is live.
  update public.unified_tags t
     set merged_into_id = (select id from public.unified_tags where slug = 'sti' and status = 'active')
   where t.slug = 'sexually-transmitted-infections-stis'
     and exists (select 1 from public.unified_tags m
                  where m.id = t.merged_into_id and m.status <> 'active')
     and exists (select 1 from public.unified_tags where slug = 'sti' and status = 'active');
end $mig$;

-- Postconditions.
do $verify$
declare
  v_bad int;
begin
  -- Counted POSITIVELY: the obvious form (count rows in a BAD state) passes
  -- vacuously for a slug that has gone missing from the corpus entirely, which
  -- is exactly what the softened guards above let through.
  select count(*) into v_bad from public.unified_tags
   where slug in ('anal-cancer-screening','anal-warts','candidiasis','chancroid','condom-external',
     'condom-internal','condom-negotiation','condomless','dental-dam','drug-substitution-therapy',
     'early-syphilis','epididymitis','herpes','hpv','hpv-vaccination','late-syphilis',
     'molluscum-contagiosum','needle-exchange-program-nep','opportunistic-infections',
     'oral-candidiasis-thrush','papanicolaou-test-pap-test','prep-adherence','prep-resistant-hiv',
     'primary-syphilis','pubic-lice','resistance-testing','secondary-syphilis','serodiscordant',
     'serological-test','seroconversion','seroprevalence','sexual-health-screening','sti-testing',
     'supervised-injection-site','tertiary-syphilis','test-of-cure','test-of-reinfection',
     'treponemal-test','viral-load','viral-suppression')
     and status = 'active'
     and deprecated_at is null
     and deprecation_reason is null
     and category_id is not null
     and not seo_indexable
     and not human_reviewed
     and coalesce(long_description, '') <> '';
  if v_bad <> 40 then
    raise exception 'verify: expected 40 revived rows active, unpublished, categorised and bodied; found %', v_bad;
  end if;

  -- HPV must now render, or the merge pointing at it still resolves nowhere.
  select count(*) into v_bad from public.unified_tags t
    join public.unified_tags m on m.id = t.merged_into_id
   where t.slug = 'hpv-human-papillomavirus' and m.status <> 'active';
  if v_bad > 0 then
    raise exception 'verify: the HPV merge still points at a row that does not render';
  end if;

  -- No merge may point at another MERGED row: a redirect to a redirect.
  select count(*) into v_bad from public.unified_tags t
    join public.unified_tags m on m.id = t.merged_into_id
   where m.status = 'merged';
  if v_bad > 0 then
    raise exception 'verify: % merge chain(s) still point at a merged row', v_bad;
  end if;

  -- `serosorting` stays deprecated: it is an alias of the live `seroadaptation`.
  select count(*) into v_bad from public.unified_tags
   where slug = 'serosorting' and status = 'active';
  if v_bad > 0 then
    raise exception 'verify: an alias-shadowed slug was revived after all';
  end if;

  -- Nothing revived here may be indexable.
  select count(*) into v_bad from public.unified_tags
   where slug in ('hpv','viral-load','seroconversion','dental-dam','primary-syphilis')
     and status = 'active' and seo_indexable;
  if v_bad > 0 then
    raise exception 'verify: % revived row(s) are published to crawlers', v_bad;
  end if;
end $verify$;
