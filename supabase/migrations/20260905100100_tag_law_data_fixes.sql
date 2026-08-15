-- Repair the inputs the legal-citation work sits on top of.
--
-- Found while measuring Wikidata coverage for 20260905100000: three of the
-- highest-usage law tags are linked to the WRONG ENTITY, and the 2026-04-27
-- backfill wrote the wrong entity's own description into tag_sources.claim_summary,
-- so the evidence was sitting in the database the whole time:
--
--   hate-crimes           (401 uses)  Q51133006  "episode of Homicide: Life on the Street (S4 E5)"
--   don-t-ask-don-t-tell  (255 uses)  Q5291420   "2002 film by Douglas Miles"
--   bathroom-bills        (200 uses)  Q127758026 "scholarly article"
--   legal                 ( 17 uses)  Q185351    "legal scholar or academic ..."   (that is `jurist`)
--
-- `legal` additionally carried wikipedia_url = /wiki/Jurist while its own
-- description reads "something that complies with the law" — a different concept.
--
-- REPOINTED, NOT NULLED. The correct QIDs are not guesses: each was resolved by
-- asking the English Wikipedia which Wikidata item its article is the sitelink for
-- (action=query&prop=pageprops&ppprop=wikibase_item), which is an independent
-- signal from the label search that produced the bad ones in the first place —
-- label search is what makes a namesake win. Each was then confirmed by P31:
--
--   Hate crime            -> Q459409    P31 = type of crime
--   Don't ask, don't tell -> Q135475    P31 = policy   (desc: "1994-2011 policy on
--                                       gay people serving in the US military",
--                                       which matches the tag's own description)
--   Bathroom bill         -> Q24964968  desc = "type of proposed legislation"
--   Law                   -> Q7748      P31 = academic discipline / field of work
--
-- `jurist` keeps Q185351 — it was the one tag that was right.
--
-- NOT TOUCHED, deliberately: human-rights-monitoring -> Q131846662, which P31s as
-- an organization while the tag names a practice. No corroborated replacement was
-- found, and this migration does not guess.

-- ── 0. Claim the edit before touching unified_tags ─────────────────────────
-- log_unified_tag_change() raises on any change to a human_reviewed tag when
-- `app.actor` is unset, because it defaults to 'system:trigger' and the guard is
-- `actor LIKE 'system:%'`. `hate-crimes` is human_reviewed = true,
-- verification_status = 'reviewed' — i.e. a human reviewed it and it STILL
-- pointed at a television episode, which is the strongest argument for making
-- this repair rather than trusting the flag. This has to run BEFORE the UPDATEs,
-- not inside the re-file block further down, and it also stamps tag_change_log
-- so the edit is attributable.
select set_config('app.actor', 'admin:tag-law-fixes-20260905', true);

-- ── 1. Repoint the four wrong links ────────────────────────────────────────
update public.unified_tags set wikidata_id = 'Q459409'
 where slug = 'hate-crimes' and wikidata_id = 'Q51133006';

update public.unified_tags set wikidata_id = 'Q135475'
 where slug = 'don-t-ask-don-t-tell' and wikidata_id = 'Q5291420';

update public.unified_tags
   set wikidata_id = 'Q24964968',
       wikipedia_url = coalesce(wikipedia_url, 'https://en.wikipedia.org/wiki/Bathroom_bill')
 where slug = 'bathroom-bills' and wikidata_id = 'Q127758026';

-- Both halves wrong here: the article link pointed at Jurist too.
update public.unified_tags
   set wikidata_id = 'Q7748',
       wikipedia_url = 'https://en.wikipedia.org/wiki/Law'
 where slug = 'legal' and wikidata_id = 'Q185351';

-- ── 2. Drop the backfill rows that cached the wrong entity ─────────────────
-- The easy miss. These feed the +0.05 confidence term in 20260607146000, so
-- leaving them means the tag scores MORE trustworthy for citing a TV episode.
-- Only the provably-wrong rows go; the correct wikipedia rows on hate-crimes and
-- don-t-ask-don-t-tell (which always pointed at the right article) stay.
delete from public.tag_sources s
 using public.unified_tags t
 where s.tag_id = t.id
   and s.source_type = 'wikidata'
   and (t.slug, s.source_id) in (
     ('hate-crimes', 'Q51133006'),
     ('don-t-ask-don-t-tell', 'Q5291420'),
     ('bathroom-bills', 'Q127758026'),
     ('legal', 'Q185351')
   );

delete from public.tag_sources s
 using public.unified_tags t
 where s.tag_id = t.id
   and s.source_type = 'wikipedia'
   and t.slug = 'legal'
   and s.source_url = 'https://en.wikipedia.org/wiki/Jurist';

-- ── 3. Re-file tags that are not law out of the Rights & Activism subtree ──
-- `legal-rights` and its siblings collected a lot that is not law: professions
-- folded in from the old catalogs (their own descriptions still say so), service
-- types, and one political ideology. This matters beyond tidiness — the tag page
-- now offers a "Source of law" block, and a category is the coarse signal for
-- which tags are law-shaped at all.
--
-- CONSERVATIVE ON PURPOSE. Only tags with an unambiguously correct destination
-- move. Left alone and worth a separate pass:
--   * gb, gb-based, uk-based, us-based, netherlands-based, australian-business,
--     international — organisation-provenance labels from the scraper. There is
--     no correct category for them; the right action is deprecation, not a move
--     to a category that is a different kind of wrong.
--   * office, university, academic-institution, training — arguably workplace
--     policy, arguably venues. Ambiguous, so untouched.
--   * prison, body-autonomy — deliberately filed under legal-rights by
--     20260803035527. Not re-litigated here.
--   * strafverfolgung (prosecution), appeal — genuinely legal terms.
--   * displacement — its Wikidata target is a DISAMBIGUATION page; broken in a
--     different way, out of scope.
--
-- Mechanics follow 20260803035527 exactly: one assignment per statement, and
-- category_id set to NULL rather than repointed, because
-- unified_tags_recompute_is_adult (AFTER, on assignments) and
-- sync_tag_category_assignment (BEFORE, on unified_tags) otherwise bounce off each
-- other with 27000 "tuple to be updated was already modified".

create temp table _refile_law(slug text primary key, cat text) on commit drop;
insert into _refile_law(slug, cat) values
  -- professions, not rights (several say "folded from the professions catalog")
  ('lawyer', 'professions-allies'),
  ('jurist', 'professions-allies'),
  ('civil-rights-activist', 'professions-allies'),
  ('advocate', 'professions-allies'),
  ('politiker', 'professions-allies'),
  ('aktivist', 'professions-allies'),
  ('lehrer', 'professions-allies'),
  ('unternehmer', 'professions-allies'),
  -- service types folded from the venue/event service catalogs
  ('legal-consultation', 'support-services'),
  ('registration', 'support-services'),
  -- an ideology and a social condition, neither a right. Note both go to
  -- `current-affairs` (under Support & News) rather than `political-activism`:
  -- that category is itself a child of Rights & Activism, so sending them there
  -- would leave them inside the subtree this block exists to empty — and calling
  -- white supremacy a form of activism would be its own error.
  ('white-supremacy', 'current-affairs'),
  ('poverty', 'current-affairs');

do $do$
declare r record; v_removed int := 0; v_added int := 0; v_cleared int := 0;
begin
  -- Re-asserted: set_config(..., true) is transaction-local, and the DO block
  -- above ran in the same transaction, but re-stating it keeps this block
  -- correct if it is ever lifted out on its own.
  perform set_config('app.actor', 'admin:tag-law-fixes-20260905', true);

  for r in
    select a.id from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id
      join _refile_law f on f.slug = t.slug
     where a.category_id in (
       select tc.id from public.tag_categories tc
       left join public.tag_categories tcp on tcp.id = tc.parent_id
        where tc.name = 'Rights & Activism' or tcp.name = 'Rights & Activism')
  loop
    delete from public.tag_category_assignments where id = r.id;
    v_removed := v_removed + 1;
  end loop;

  for r in
    select t.id tag_id, c.id cat_id from _refile_law f
      join public.unified_tags t on t.slug = f.slug
      join public.tag_categories c on c.slug = f.cat
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, r.cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_added := v_added + 1;
  end loop;

  for r in
    select t.id from public.unified_tags t join _refile_law f on f.slug = t.slug
     where t.category_id is not null
  loop
    update public.unified_tags set category_id = null where id = r.id;
    v_cleared := v_cleared + 1;
  end loop;

  raise notice 're-filed: % rights assignments removed, % added, % category_id mirrors cleared',
    v_removed, v_added, v_cleared;
end $do$;

-- ── 4. Post-conditions ─────────────────────────────────────────────────────
do $do$
declare v_bad int; v_names text;
begin
  select count(*), string_agg(slug || '=' || wikidata_id, ', ')
    into v_bad, v_names
    from public.unified_tags
   where wikidata_id in ('Q51133006', 'Q127758026')
      or (slug in ('don-t-ask-don-t-tell') and wikidata_id = 'Q5291420')
      or (slug = 'legal' and wikidata_id = 'Q185351');
  if v_bad > 0 then
    raise exception '% tag(s) still point at the wrong Wikidata entity: %', v_bad, v_names;
  end if;

  select count(*) into v_bad from public.tag_sources s
    join public.unified_tags t on t.id = s.tag_id
   where s.source_id in ('Q51133006', 'Q127758026')
      or (t.slug = 'don-t-ask-don-t-tell' and s.source_id = 'Q5291420')
      or (t.slug = 'legal' and s.source_id = 'Q185351');
  if v_bad > 0 then
    raise exception '% stale tag_sources row(s) still cache a wrong entity', v_bad;
  end if;

  -- `jurist` is the control: it was correct and must not have been swept up.
  if not exists (select 1 from public.unified_tags
                  where slug = 'jurist' and wikidata_id = 'Q185351') then
    raise exception 'jurist lost its correct Wikidata link';
  end if;

  select count(*), string_agg(t.slug, ', ') into v_bad, v_names
    from public.unified_tags t
    join _refile_law f on f.slug = t.slug
    join public.tag_category_assignments a on a.tag_id = t.id
    join public.tag_categories tc on tc.id = a.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
   where tc.name = 'Rights & Activism' or tcp.name = 'Rights & Activism';
  if v_bad > 0 then
    raise exception '% re-filed tag(s) still sit under Rights & Activism: %', v_bad, v_names;
  end if;
end $do$;
