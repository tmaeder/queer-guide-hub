-- Two rows the glossary comparison flagged and deferred: methadone, whose page
-- explained stereoisomerism instead of the drug, and the Lavender Scare, which
-- exists twice — the good row deprecated and the empty one live.
--
-- ── METHADONE ────────────────────────────────────────────────────────────────
--
-- Deprecated by `auto: zero usage` on 2026-07-24 while `buprenorphine` and
-- `naloxone` sit beside it active, reviewed and indexable. Those two are what
-- this row should have looked like all along; all three are one clinical
-- picture, and the corpus carried two thirds of it.
--
-- THE PROSE IS NOT THE WRONG-ENTITY CLASS, AND THAT DISTINCTION DECIDES THE FIX.
-- `wikidata_id` is Q179996, and Q179996 is genuinely methadone — resolved live
-- rather than assumed: its label is "(RS)-methadone", it sitelinks to
-- en:Methadone, and `wbsearchentities` returns no separate medication item (the
-- alternatives are methadone hydrochloride, a punk band, and "methadone clinic").
-- So nothing here is repointed and nothing is nulled. What went wrong is that
-- Q179996's own English DESCRIPTION is the string "group of stereoisomers", and
-- the enrichment sweep wrote the page from it:
--
--   short_description  "Group of stereoisomers"
--   long_description   an explanation of what stereoisomers are, plus a list of
--                      German trade names (Polamidon, Levomethadon,
--                      Methadonhydrochlorid, Methadon-Therapie)
--
-- Chemically true and useless to the reader this platform has. A harm-reduction
-- glossary entry for methadone that never mentions its half-life is not a thin
-- page, it is a wrong one. **A correct identifier does not make the prose derived
-- from it correct** — the two failure modes are independent, and only one of them
-- is fixed by clearing a QID.
--
-- `description` was serviceable ("A synthetic opioid used to treat opioid
-- addiction and pain, with a high potential for abuse and addiction") and is
-- still replaced, because its tail is the moralising register `TAG_STYLE_SYSTEM`
-- bans and because a row being brought to `reviewed` should read in one voice.
-- That is a deliberate rewrite of correct-but-weak prose, stated here rather
-- than folded in silently.
--
-- The replacement is written to match `buprenorphine` and `naloxone`: what it is,
-- then the one property people actually run into. For methadone that is the gap
-- between how long it lasts and how long it feels like it lasts — which is why
-- substitution deaths cluster in the first two weeks, why chasing a faded dose
-- kills hours later, and why naloxone (which works on it, unlike on
-- buprenorphine) wears off long before the methadone does.
--
-- `wikipedia_url` was NULL and is filled, corroborated both ways: the sitelink
-- resolves and the article title agrees with the tag name, which is the pair
-- `tag-wiki-guard.ts` requires.
--
-- ── LAVENDER SCARE ───────────────────────────────────────────────────────────
--
-- The concept has two rows and the wrong one is live:
--
--   lavender-scare   DEPRECATED. Correct slug, correct QID (Q2896360), correct
--                    Wikipedia link, 703 + 484 chars of accurate prose. Culled
--                    by the same `auto: zero usage` sweep.
--   lavenderscare    ACTIVE. A despaced scrape artefact — no description, no
--                    short_description, no long_description, no QID, deindexed
--                    with `seo_deindex_reason = 'thin'`, which is exactly right
--                    for a row with nothing on it.
--
-- Both carry zero `unified_tag_assignments`, so the merge moves no content and
-- the direction is not a judgement call: the row with the prose wins.
--
-- MERGED, NOT DEPRECATED, because `merge_tag_concept` mints an alias from the
-- loser's name — so "lavenderscare" keeps routing to the page instead of
-- becoming a dead string — and because the whole thing is reversible through
-- `unmerge_tag_concept(audit_id)`. That auto-alias is normally the hazard here
-- (20360401100100 had to delete its own, because both its rows were named "Queer
-- Theory" and `alias_equals_name` is a zero-invariant); it is safe in this pair
-- only because "Lavenderscare" and "Lavender Scare" differ by a space, which the
-- assertion below re-checks rather than trusts.
--
-- REFILED Slang & Language -> Movements & Milestones. A 1950s federal purge is
-- not a slang term. The target is where its siblings already are — `stonewall`,
-- `stonewall-riots`, `daughters-of-bilitis`, `gay-rights-movement` — rather than
-- the more obvious-sounding `History & Rights`, which measured out as mostly
-- demonyms (american, basque, european, german). Only `category_id` is written:
-- the BEFORE trigger derives the text and the AFTER trigger moves the primary
-- junction, which is the precedent set by 20261006110000.
--
-- The stale Slang & Language membership is then DELETED, following the rule
-- 20361001100100 set when it found `unified_tags_recompute_is_adult()` is an
-- EXISTS over `tag_category_assignments` that ignores `is_primary`: drop only the
-- membership that is actually wrong. Slang & Language is not on the adult list,
-- so nothing here turns on it — but a purge filed under slang is wrong whether
-- or not it is currently load-bearing.
--
-- ── BOTH ─────────────────────────────────────────────────────────────────────
--
-- `seo_indexable` IS SET EXPLICITLY ON EVERY REVIVE. 20361001100100 is the
-- reason: 20360401100100's revive moved status and review flags and never
-- touched the column, so eight published terms stayed invisible to crawlers with
-- nothing to self-heal them. Both rows here happen to already read `true` while
-- deprecated, which is not a decision anybody made — so it is written.
--
-- `human_reviewed = true` is deliberate on both and is the documented escape
-- hatch from `deprecate_unused_tags`, which selects exactly
-- `status='active' AND human_reviewed=false AND usage_count=0` — and both rows
-- have zero usage, so reviving them honest-but-unflagged would re-offer them to
-- the next sweep. The flag is earned here: this prose was read and written by
-- hand, not swept in.
--
-- Soft on preconditions, hard on postconditions.

do $mig$
declare
  v_meth  uuid;
  v_ls    uuid;
  v_junk  uuid;
  v_cat   uuid;
  v_audit uuid;
  v_n     int;
  v_bad   text;
begin
  perform set_config('app.actor', 'migration:methadone-and-lavender-scare', true);

  select id into v_meth from public.unified_tags where slug = 'methadone';
  select id into v_ls   from public.unified_tags where slug = 'lavender-scare';
  select id into v_junk from public.unified_tags where slug = 'lavenderscare';
  select id into v_cat  from public.tag_categories where slug = 'movements-milestones';

  if v_meth is null then raise exception 'methadone: row is gone'; end if;
  if v_ls   is null then raise exception 'lavender-scare: row is gone'; end if;
  if v_cat  is null then raise exception 'lavender-scare: category movements-milestones not found'; end if;

  ------------------------------------------------------------ 1. methadone
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    human_reviewed      = true,
    verification_status = 'reviewed',
    seo_indexable       = true,
    seo_deindex_reason  = null,
    last_verified_at    = now(),
    updated_at          = now()
  where id = v_meth;

  -- Content-guarded: if someone has already replaced the Wikidata-derived body,
  -- their prose stands and only the publish above applies.
  update public.unified_tags set
    short_description = 'A long-acting full opioid agonist used for opioid substitution treatment and for pain.',
    description =
      'A long-acting synthetic opioid used for opioid substitution treatment and for pain. '
      'It stays in the body far longer than it feels like it does, so it accumulates over the '
      'first days of dosing and the risk of fatal overdose is highest then, not later.',
    long_description =
'Methadone is a full opioid agonist, taken daily as a liquid or tablet, used both for opioid substitution treatment and as a painkiller. Unlike buprenorphine it has no ceiling: its effect on breathing deepens with dose rather than levelling off.

The property that kills people is the gap between how long it lasts and how long it feels like it lasts. The subjective effect fades after roughly four to eight hours, while the elimination half-life runs from about eight to sixty hours and varies widely between individuals. Blood levels therefore keep climbing for several days on a fixed dose before they settle, which is why deaths in substitution treatment cluster in the first two weeks and why the dose is raised slowly.

That same gap is why re-dosing to chase an effect that has worn off is so dangerous. The earlier dose has not left, and the total can reach a fatal level hours later, often during sleep.

Tolerance falls quickly after any break. A dose that was routine before prison, hospital or a period of abstinence can be fatal on return, which is why induction restarts low.

Most methadone-involved deaths involve another depressant — benzodiazepines, alcohol, gabapentinoids. Separately, methadone prolongs the QT interval in a dose-related way and can trigger a dangerous arrhythmia, so higher doses and other QT-prolonging medicines warrant ECG monitoring.

Naloxone does reverse a methadone overdose, unlike with buprenorphine. But methadone outlasts naloxone by many hours, so one dose is not the end of it: emergency care is needed, further doses may be, and someone who wakes up must not be left alone.',
    wikipedia_url = 'https://en.wikipedia.org/wiki/Methadone',
    updated_at    = now()
  where id = v_meth
    and long_description ilike '%group of stereoisomers%';

  ------------------------------------------------------- 2. lavender scare
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    human_reviewed      = true,
    verification_status = 'reviewed',
    seo_indexable       = true,
    seo_deindex_reason  = null,
    category_id         = v_cat,
    last_verified_at    = now(),
    updated_at          = now()
  where id = v_ls;

  delete from public.tag_category_assignments a
   using public.tag_categories c
   where a.tag_id = v_ls and a.category_id = c.id
     and c.slug = 'slang-terminology'
     and not a.is_primary;
  get diagnostics v_n = row_count;
  raise notice 'lavender-scare: dropped % stale Slang & Language membership row(s)', v_n;

  if v_junk is not null
     and exists (select 1 from public.unified_tags where id = v_junk and status = 'active') then

    -- DEMOTE BEFORE MERGE. `merge_tag_concept` deletes the loser's category row
    -- only when the winner holds the SAME category_id; filed differently it just
    -- REPOINTS it (`update tag_category_assignments set tag_id = p_canonical_id`),
    -- and two is_primary rows on one tag violate the partial unique index
    -- `tag_category_assignments_one_primary_per_tag`. This pair is exactly that
    -- case — Community Life & Support against Movements & Milestones — and the
    -- dry run aborted 23505 here before the demote existed.
    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_junk and is_primary;

    v_audit := public.merge_tag_concept(
      v_ls, v_junk, 'migration:methadone-and-lavender-scare', 'empty-duplicate');
    raise notice 'lavender-scare: merged empty duplicate, audit %', v_audit;

    -- The demoted row survives the merge as a non-primary membership on the
    -- winner. It is deleted rather than kept: 20361001100100's rule is to drop
    -- only the membership that is actually wrong, and this one carries no
    -- editorial intent at all — it is the arbitrary filing of a scrape artefact
    -- with no prose, no identifier and no assignments.
    delete from public.tag_category_assignments a
     using public.tag_categories c
     where a.tag_id = v_ls and a.category_id = c.id
       and c.slug = 'support-services'
       and not a.is_primary;
  end if;

  ------------------------------------------------------------- assertions
  select count(*) into v_n from public.unified_tags
   where id = v_meth
     and (status <> 'active' or not seo_indexable or not human_reviewed
          or verification_status <> 'reviewed' or wikidata_id <> 'Q179996');
  if v_n > 0 then
    raise exception 'methadone: not published-and-reviewed, or lost its identifier';
  end if;

  select count(*) into v_n from public.unified_tags
   where id = v_meth
     and (coalesce(short_description,'') || coalesce(description,'') || coalesce(long_description,''))
         ilike '%stereoisomer%';
  if v_n > 0 then
    raise exception 'methadone: still carries the stereoisomer prose';
  end if;

  select count(*) into v_n from public.unified_tags
   where id = v_meth and coalesce(btrim(long_description),'') = '';
  if v_n > 0 then
    raise exception 'methadone: long_description is empty';
  end if;

  select count(*) into v_n from public.unified_tags
   where id = v_ls
     and (status <> 'active' or not seo_indexable or not human_reviewed
          or verification_status <> 'reviewed' or wikidata_id <> 'Q2896360' or is_adult);
  if v_n > 0 then
    raise exception 'lavender-scare: not published-and-reviewed, or lost its identifier, or went adult';
  end if;

  select count(*) into v_n from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.id = v_ls and c.slug <> 'movements-milestones';
  if v_n > 0 then
    raise exception 'lavender-scare: did not refile to Movements & Milestones';
  end if;

  if not exists (select 1 from public.tag_category_assignments a
                  join public.tag_categories c on c.id = a.category_id
                 where a.tag_id = v_ls and a.is_primary and c.slug = 'movements-milestones') then
    raise exception 'lavender-scare: primary junction row did not move — /tags/:slug reads the JUNCTION';
  end if;

  if exists (select 1 from public.tag_category_assignments a
              join public.tag_categories c on c.id = a.category_id
             where a.tag_id = v_ls and c.slug = 'slang-terminology') then
    raise exception 'lavender-scare: stale Slang & Language membership survived';
  end if;

  -- Exactly one membership, and it is the right one. This is what catches the
  -- merge quietly handing the winner the loser's filing.
  select string_agg(c.slug, ', ' order by c.slug) into v_bad
    from public.tag_category_assignments a
    join public.tag_categories c on c.id = a.category_id
   where a.tag_id = v_ls;
  if v_bad is distinct from 'movements-milestones' then
    raise exception 'lavender-scare: category memberships are [%], expected only movements-milestones', v_bad;
  end if;

  if v_junk is not null then
    select count(*) into v_n from public.unified_tags where id = v_junk and status = 'active';
    if v_n > 0 then
      raise exception 'lavender-scare: the empty duplicate is still active';
    end if;
    -- The merge's own auto-alias is what keeps "lavenderscare" routing somewhere.
    if not exists (select 1 from public.tag_aliases
                    where canonical_tag_id = v_ls and alias_slug = 'lavenderscare') then
      raise exception 'lavender-scare: the merge left no alias for the absorbed slug';
    end if;
  end if;

  --------------------------------------------------- corpus zero-invariants
  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_n > 0 then
    raise exception 'alias_equals_name is % corpus-wide, must stay 0 (merge auto-alias?)', v_n;
  end if;

  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug = t.slug;
  if v_n > 0 then
    raise exception '% self-alias row(s) exist', v_n;
  end if;

  select count(*) into v_n from public.tag_aliases a
   where exists (select 1 from public.unified_tags t
                  where t.slug = a.alias_slug and t.status = 'active'
                    and t.id <> a.canonical_tag_id);
  if v_n > 0 then
    raise exception '% alias(es) shadow a live tag corpus-wide', v_n;
  end if;

  select count(*) into v_n from public.unified_tags
   where status = 'active' and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_n > 0 then
    raise exception '% indexable row(s) corpus-wide have no prose', v_n;
  end if;

  raise notice 'methadone republished with real prose; lavender-scare revived, refiled and de-duplicated';
end
$mig$;
