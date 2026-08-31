-- Kinktionary-corroborated revival, wave 4 of 4 — identity, relationships, slang, health, safety, events.
--
-- WHAT THIS FIXES
--
-- A one-off data-quality audit on 2026-06-05 set status='deprecated' on 4,355
-- tags whose only fault was being "orphan (no entity assignments, relations,
-- synonyms, or aliases)", and a separate "auto: zero usage" pass took 717 more.
-- That is a USAGE test applied to a GLOSSARY. A glossary term's worth does not
-- depend on whether a venue happens to be tagged with it.
--
-- Measured on prod before this migration: 4,130 of the orphan-deprecated rows
-- still carry >200 characters of finished prose and 1,150 carry a wikidata_id.
-- fetchTagWithCategories (src/hooks/usePageFetchers.ts) filters
-- .eq('status','active'), so every one of them answers "No such term" today.
-- /tags/felching, /tags/figging, /tags/bastinado and /tags/omorashi are each a
-- finished page with 300-550 characters of prose and a Wikidata ID, serving a
-- 404. Same shape as 20261002100200: the corrected pages do not exist.
--
-- WHY THE KINKTIONARY, AND WHAT IS AND IS NOT TAKEN FROM IT
--
-- FetLife's Kinktionary (https://fetlife.com/kinktionary) is a public,
-- community-curated glossary of 1,892 terms. It is used here as INDEPENDENT
-- CORROBORATION that a term is live kink vocabulary — that is what makes
-- reviving these rows a measured decision rather than an arbitrary one.
--
-- NOT ONE WORD OF THEIR PROSE IS COPIED OR ADAPTED. Their licence
-- (https://fetlife.com/kinktionary/license-zcfzz) is non-commercial only —
-- "You may not use any material from the Kinktionary for commercial purposes
-- without the express written consent of FetLife" — and queer.guide is
-- commercial (marketplace, affiliate_partners, Stripe). The NC term binds
-- adaptations too, so paraphrase is equally out. What is used is the term list
-- and the section a term sits in: facts and short phrases, used only to decide
-- WHICH of our own already-written rows deserve to be live. Every sentence on
-- these pages is prose this project wrote. Same posture, and the same reason, as
-- the "THE PROSE IS OURS" section of 20260907100000.
--
-- STATUS ONLY. CATEGORY IS DELIBERATELY NOT REWRITTEN.
--
-- 952 of the 961 corroborated rows already carry a category_id, and a
-- section-by-category cross-tab showed them broadly consistent with the
-- Kinktionary's own sectioning. Re-filing 961 rows on the strength of a foreign
-- taxonomy would be a second, unreviewed change riding along with this one.
-- Only the 3 row(s) in this wave that carry NO category at all are
-- assigned, by hand, below. Genuine disagreements (26 gender terms filed under
-- Sexual Orientation) are recorded for the separate correction pass.
--
-- category_id IS WRITTEN ON unified_tags, NOT INTO tag_category_assignments.
-- tag_hygiene_stats().uncategorized_active counts unified_tags.category_id;
-- 20260907100000 and 20260910171943 wrote only the junction, and their tags
-- still read as uncategorized on prod today (444 such rows measured).
-- trg_sync_tag_category_after owns the junction and fires on category_id.
--
-- NAME IS NEVER WRITTEN. normalize_tag_input() re-derives the slug from name on
-- any UPDATE that changes it — 20260910171943 records 'Pride Flag' ->
-- 'Rainbow Pride Flag' silently MOVING the row to a new slug. Across 961 rows
-- that would be unrecoverable, so name does not appear in the UPDATE at all.
--
-- seo_indexable IS COMPUTED FROM THE PROSE, NOT SET BLIND.
-- indexable_without_description is a zero-invariant in check-tag-hygiene.mjs,
-- which measures PROD — a blanket true would red every open PR in the repo
-- until run_tag_thin_page_reindex drained it at 400 rows/night. All rows in
-- this wave were measured to have description or short_description, so the
-- expression below evaluates true for all of them; it is written as an
-- expression anyway so a drifted row degrades to deindexed instead of to red CI.
--
-- human_reviewed = true IS LOAD-BEARING TWICE: deprecate_unused_tags() skips
-- human-reviewed rows (it is currently scheduled in no cron and no
-- admin_automations row, but that is a fact about today, not a guarantee), and
-- enforce_tag_seo_sensitivity_gate() forces seo_indexable := false on a
-- sensitive or adult row that is not human-reviewed. 575 of these rows are
-- is_adult, so without the flag most of this wave would revive deindexed.
--
-- KNOWN AND ACCEPTED CONSEQUENCE. run_tag_assignment_reconcile (nightly) builds
-- its auto-tagging map from lower(name)/lower(slug) of every ACTIVE tag. 51 of
-- the revived slugs match free-text tags on existing content and will attach to
-- 503 rows on the next run. Most are correct (asexual, femme, chosen-family,
-- abroromantic). ~15 are ordinary English words whose kink sense differs from
-- the content's (teacher, queen, priest, lion, camp) and are recorded in
-- docs/audits/ for the correction pass. This is a restoration of the state that
-- held before 2026-06-05, not a new hazard, which is why it is accepted here
-- rather than blocked — but it is named, because the same function's own
-- comment records tagging 2,609 'culture' articles as Crops.

set local statement_timeout = '600s';

-- log_unified_tag_change() raises on any change to a human_reviewed row when
-- app.actor is unset (it defaults to 'system:trigger'). Top level, not inside
-- the DO block.
select set_config('app.actor', 'migration:kinktionary-revival-w4', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_live int;
begin
  create temp table _rev (slug text primary key) on commit drop;
  insert into _rev (slug) values
    ('abroromantic'),
    ('abseiling'),
    ('accipiosexual'),
    ('accomplice'),
    ('achillean'),
    ('adult-nursing-relationship'),
    ('aegoromantic'),
    ('after-scene-drop'),
    ('agender'),
    ('alliteration'),
    ('alterous-attraction'),
    ('altersex'),
    ('amatonormativity'),
    ('ambiamorous'),
    ('anal-august'),
    ('anasyrma'),
    ('anchor-partner'),
    ('androgynosexual'),
    ('androsexual'),
    ('androx'),
    ('anesigender'),
    ('apagender'),
    ('aposexual'),
    ('apresromantic'),
    ('aroflux'),
    ('asexual'),
    ('aurasexual'),
    ('autoromantic'),
    ('bacchanalia'),
    ('backshot'),
    ('benignoromantic'),
    ('benignosexual'),
    ('berrisexual'),
    ('bi-friendly'),
    ('bi-situational'),
    ('bicurious'),
    ('bigender'),
    ('bonded'),
    ('boston-marriage'),
    ('boy'),
    ('boyflux'),
    ('boyfriend'),
    ('bussy'),
    ('butch'),
    ('cake-and-cunnilingus-day'),
    ('camp'),
    ('cassexual'),
    ('catfish'),
    ('chaser'),
    ('chosen-family'),
    ('comet-partner'),
    ('companion'),
    ('compersion'),
    ('conditions-disorders'),
    ('cosbied'),
    ('coterie'),
    ('covert-contract'),
    ('crew'),
    ('crossdresser-transvestite'),
    ('crumbs'),
    ('crushing-on'),
    ('cuddle-buddy'),
    ('cupioromantic'),
    ('cuttlefish-method'),
    ('demian'),
    ('demiboy'),
    ('demifemme'),
    ('demigender'),
    ('demigirl'),
    ('demiman'),
    ('demiwoman'),
    ('desinoromantic'),
    ('dilf'),
    ('distance-control'),
    ('divorced'),
    ('dominance-and-submission-d-s'),
    ('domspace'),
    ('double-glazing'),
    ('duminant'),
    ('dyke'),
    ('enbian'),
    ('engaged'),
    ('erectile-function'),
    ('ethical-non-monogamy'),
    ('eunuch'),
    ('event-safety'),
    ('exit-strategy'),
    ('fantasy-pushing'),
    ('faunetflux'),
    ('febfem'),
    ('female'),
    ('femme'),
    ('fictoromantic'),
    ('finromantic'),
    ('finsexual'),
    ('flirtationship'),
    ('flock'),
    ('florasexual'),
    ('fluffing'),
    ('food-buddy'),
    ('friends-with-mutual-feelings'),
    ('fuckalicious'),
    ('fuckit-list'),
    ('futch'),
    ('fweeb'),
    ('gangbang-party'),
    ('gender-neutral'),
    ('gender-non-conforming'),
    ('gender-nullification'),
    ('genderfae'),
    ('genderfaun'),
    ('genderflux'),
    ('genderfuck'),
    ('genderless'),
    ('girl'),
    ('girlflux'),
    ('girlfriend'),
    ('glitchgender'),
    ('graygender'),
    ('grayromantic'),
    ('grounding'),
    ('gyneromantic'),
    ('gynesexual'),
    ('gynx'),
    ('hard-limits'),
    ('harem-holder'),
    ('heteroromantic'),
    ('heterotypical'),
    ('hijra-south-asia'),
    ('hinge-partner'),
    ('hobosexual'),
    ('hole-dozer'),
    ('homiesexual'),
    ('homoromantic'),
    ('homosexual'),
    ('honorifics'),
    ('horny-net-geek-hng'),
    ('iamvanosexual'),
    ('intersex-male'),
    ('intimate'),
    ('intimate-partner-abuse'),
    ('it-s-complicated'),
    ('joyfriend'),
    ('leather-family'),
    ('level-party'),
    ('life-partner'),
    ('limerence'),
    ('lithromantic'),
    ('long-distance-dynamic'),
    ('long-distance-relationship'),
    ('lovedrug'),
    ('lover'),
    ('male'),
    ('man'),
    ('mare-cunt'),
    ('married'),
    ('masc'),
    ('masturbation-party'),
    ('meeting-for-the-first-time'),
    ('megasexual'),
    ('member-of-a-house'),
    ('men-mental-health'),
    ('menorrhagia-heavy-periods'),
    ('merosexual'),
    ('metamour'),
    ('metrosexual'),
    ('milf'),
    ('minromantic'),
    ('minsexual'),
    ('mono-poly'),
    ('monogamish'),
    ('monogamous'),
    ('monoromantic'),
    ('monosexual'),
    ('morosexual'),
    ('multigender'),
    ('munch'),
    ('musicgender'),
    ('nebularomantic'),
    ('neogender'),
    ('neosexual'),
    ('neptunic'),
    ('neurodivergence'),
    ('neuroqueer'),
    ('ninromantic'),
    ('ninsexual'),
    ('no-nut-november'),
    ('noetiromantic'),
    ('non-binary-terms-of-endearment'),
    ('non-monogamous'),
    ('novosexual'),
    ('objectum-sexuality'),
    ('omniromantic'),
    ('omnisexual'),
    ('open-marriage'),
    ('otter'),
    ('pack'),
    ('padded'),
    ('pangender'),
    ('panromantic'),
    ('paraboy'),
    ('paragirl'),
    ('partner'),
    ('partners-in-mischief'),
    ('pay-for-play'),
    ('peer-rope'),
    ('pelvic-floor-health'),
    ('pelvic-organ-prolapse'),
    ('penis-health-care'),
    ('phallosexual'),
    ('pivotsexual'),
    ('platonic-crush'),
    ('platonic-partner'),
    ('play-partner'),
    ('play-styles'),
    ('plecostomus'),
    ('poly-family'),
    ('poly-group'),
    ('polyandrous'),
    ('polycurious'),
    ('polyfidelity'),
    ('polygender'),
    ('polygyny'),
    ('polyplatonic'),
    ('polyromantic'),
    ('polysaturation'),
    ('polysexual'),
    ('pomosexual'),
    ('pornosexual'),
    ('post-nut-clarity'),
    ('primal-partner'),
    ('primary-partner'),
    ('protecting'),
    ('pupgender'),
    ('queefing'),
    ('queer-femme'),
    ('queer-for-queer-q4q'),
    ('queerplatonic-partner'),
    ('questioning-sexuality-and-gender'),
    ('recipromantic'),
    ('relationship-anarchist'),
    ('requissexual'),
    ('risk-aware-virus-exposure-rave'),
    ('romantically-fluid'),
    ('rope-compatibility-checks'),
    ('rope-coven'),
    ('rope-family'),
    ('rope-jam'),
    ('rope-partner'),
    ('rope-social'),
    ('ropetober'),
    ('rule-34'),
    ('safe-call'),
    ('safe-sane-and-consensual-ssc'),
    ('safe-words'),
    ('safer'),
    ('salmacian'),
    ('sapioromantic'),
    ('satellite-partner'),
    ('saturnian'),
    ('scene-partner'),
    ('sea-queen'),
    ('self-collared'),
    ('sex-favorable'),
    ('sex-party'),
    ('sexual-assault-resources'),
    ('sexually-fluid'),
    ('sexuationship'),
    ('shade-of-my-heart'),
    ('single'),
    ('situationship'),
    ('skoliosexual-ceterosexual'),
    ('slang-words'),
    ('sock-puppet'),
    ('soft-limits'),
    ('solo-poly'),
    ('sologamous'),
    ('solosexual'),
    ('soulmate'),
    ('soulsexual'),
    ('spaghetti-straight'),
    ('spare-tire-partner'),
    ('split-attraction-model-sam'),
    ('spotter'),
    ('st4t'),
    ('steak-and-a-blowjob-day'),
    ('sub-frenzy'),
    ('subspace'),
    ('suicidal-thoughts'),
    ('surviving-partner'),
    ('swingers-party'),
    ('symbiosexual'),
    ('t4t'),
    ('taken-in-hand'),
    ('the-hanky-code'),
    ('tomboy'),
    ('topping-from-the-bottom'),
    ('toric'),
    ('trans-woman'),
    ('transage'),
    ('transamorous'),
    ('transfeminine'),
    ('transine'),
    ('trauma-awareness'),
    ('triad'),
    ('trixic'),
    ('trysexual'),
    ('twin-flame'),
    ('twunk'),
    ('uncollared'),
    ('unconference'),
    ('under-consideration'),
    ('under-protection'),
    ('unlabeled'),
    ('unsure'),
    ('uranic'),
    ('ussy'),
    ('vaginal-atrophy'),
    ('vaginismus'),
    ('vajazzle'),
    ('versandrogyne'),
    ('vetted'),
    ('vetting'),
    ('voidboy'),
    ('voidgirl'),
    ('vulturing'),
    ('vulvosexual'),
    ('wet-walk'),
    ('white-knight'),
    ('whump'),
    ('wolffian'),
    ('woman'),
    ('xenogender'),
    ('xxy');

  -- Every slug must already exist as a non-active row. A miss means the
  -- committed disposition file has drifted from prod; report it rather than
  -- inserting a fresh empty tag under that slug.
  select count(*) into v_bad
    from _rev k left join public.unified_tags t on t.slug = k.slug
   where t.id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % slug(s) absent from unified_tags — disposition file is stale', v_bad;
  end if;

  -- One statement per slug. Cheap at this size and the reviewed convention.
  for r in select slug from _rev order by slug loop
    update public.unified_tags set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      merged_into_id      = null,
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = (coalesce(nullif(btrim(description), ''), short_description) is not null),
      last_verified_at    = now(),
      updated_at          = now()
    where slug = r.slug
      and status <> 'active';
  end loop;

  -- The rows in this wave that carried no category at all. Assigned by hand;
  -- every other row keeps the category it already had.
  for r in select * from (values
      ('chaser', 'slang-terminology'),
      ('questioning-sexuality-and-gender', 'questioning-labels'),
      ('topping-from-the-bottom', 'bdsm-power-exchange')
  ) as v(slug, cat) loop
    update public.unified_tags u set category_id = c.id
      from public.tag_categories c
     where u.slug = r.slug and c.slug = r.cat
       and u.category_id is distinct from c.id;
  end loop;

  -- Repair category_id <-> junction drift on the rows this wave revives.
  --
  -- trg_sync_tag_category_after fires only when category_id CHANGES, so a row
  -- whose junction already disagreed with its category_id is never corrected by
  -- flipping status alone. Measured on prod: rows exist with category_id = X and
  -- exactly one is_primary junction row pointing at Y. The first deploy of this
  -- wave failed on precisely that ("3 row(s) have no primary junction row"),
  -- which is the assertion doing its job — a half-written taxonomy is what it
  -- exists to refuse.
  --
  -- DIRECTION OF THE REPAIR: THE JUNCTION WINS WHERE ONE EXISTS.
  --
  -- An earlier draft moved the junction to agree with category_id, on the
  -- reasoning that category_id is canonical (it carries the FK and is what
  -- tag_hygiene_stats().uncategorized_active reads). That is the wrong way
  -- round, and it took reading the renderer to see why: fetchTagWithCategories
  -- selects from tag_category_assignments, so THE JUNCTION IS WHAT THE PAGE
  -- SHOWS. Rewriting it would silently reclassify live pages — measured, 24 of
  -- the drifted rows in waves 2-4, moving them off a curated child category
  -- (Sexual Health) and onto whatever parent category_id happened to hold
  -- (Health & Wellness). That is precisely the "second, unreviewed change riding
  -- along" this program's header refuses.
  --
  -- So where a primary junction exists, category_id is moved to match IT. That
  -- also keeps unified_tags.category text correct: the BEFORE trigger derives
  -- it from category_id, and the text already agrees with the junction on these
  -- rows, so this direction changes no rendered category anywhere. Same
  -- direction, and the same reasoning, as 20260829054833.
  for r in select t.id, a.category_id from _rev k
             join public.unified_tags t on t.slug = k.slug
             join public.tag_category_assignments a
               on a.tag_id = t.id and a.is_primary
            where t.category_id is distinct from a.category_id
  loop
    update public.unified_tags set category_id = r.category_id where id = r.id;
  end loop;

  -- The other half: a row with a category_id and NO junction at all. Here there
  -- is nothing curated to defer to, so the junction is created from the column.
  -- Corpus-wide this shape is 59 rows; the AFTER trigger cannot produce it
  -- because it only fires when category_id changes.
  for r in select t.id, t.category_id from _rev k
             join public.unified_tags t on t.slug = k.slug
            where t.category_id is not null
              and not exists (
                select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.id, r.category_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.verification_status <> 'reviewed'
      or t.deprecated_at is not null or t.deprecation_reason is not null
      or t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % row(s) did not reach the live state', v_bad;
  end if;

  -- The CI zero-invariant, asserted where it is caused rather than discovered
  -- on an unrelated PR two hours later.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.seo_indexable
     and coalesce(nullif(btrim(t.description), ''), t.short_description) is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % indexable row(s) carry no description', v_bad;
  end if;

  -- Zero-invariant since the 2026-08-28 photo retirement.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.image_url is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % row(s) carry a retired image_url', v_bad;
  end if;

  -- Nothing in this wave may be left uncategorized: it would land straight in
  -- tag_hygiene_stats().uncategorized_active.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.category_id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % revived row(s) have no category_id', v_bad;
  end if;

  -- Both sides of the category write. Asserting only category_id is how the
  -- junction silently stayed empty in the migrations named in the header.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where not exists (
     select 1 from public.tag_category_assignments a
      where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % row(s) have no primary junction row', v_bad;
  end if;

  -- Held back on purpose; see HOLD_BACK in the generator. If one of these is
  -- live, something outside this migration revived it and the reason it was
  -- held back needs re-reading.
  select count(*) into v_bad from public.unified_tags
   where slug in ('staff', 'genderfluid', 'boytoy', 'gun-play', 'gloryhole') and status = 'active';
  if v_bad > 0 then
    raise exception 'kinktionary revive w4: % held-back slug(s) are active', v_bad;
  end if;

  select count(*) into v_live from _rev k
    join public.unified_tags t on t.slug = k.slug where t.status = 'active';
  raise notice 'kinktionary revive w4: % of % now active', v_live, (select count(*) from _rev);
end
$mig$;
