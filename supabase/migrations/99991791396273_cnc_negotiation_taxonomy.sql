-- A CNC negotiation menu, as kink taxonomy rather than as new code.
--
-- WHY THIS IS A SEED AND NOT A FEATURE
--
-- A "negotiation menu" is: here is a list of scenarios, mark each one yes / no
-- / maybe / hard limit, and flag the ones you want to talk through before
-- anything happens. That is precisely `kink_ratings` — favorite | like |
-- curious | maybe | no | hard_limit, plus `needs_discussion` — over
-- `kink_items`, which already carry a one-line consent-forward `description`
-- and a `discussion_recommended` flag.
--
-- So a menu is a category plus items. Seeding them inherits, with no new code:
-- the rating control and its 6-value scale, the guided one-item-at-a-time
-- wizard, per-category visibility tiers, `kink_compare`'s veto-aware
-- intersection reveal, expiring and revocable share links, the GDPR export, and
-- the moderation path. Writing a second rating engine for workbooks would
-- duplicate every one of those and then diverge from it.
--
-- AXIS = dom_sub, DELIBERATELY
--
-- `power-dynamics` is the only existing category on that axis, and it is the
-- right one here: in a CNC scene the two roles are not interchangeable and the
-- same person rarely wants both halves equally. `kink_compare`'s axis
-- complement already pairs `dominant` with `submissive`, so a dominant-side
-- yes meets a submissive-side yes and nothing else — which is the only
-- pairing that means anything for these scenarios.
--
-- WHY EVERY ITEM IS discussion_recommended
--
-- `discussion_recommended` surfaces a "Discuss first" badge in the wizard and
-- promotes a compare row from 'overlap' to 'discuss'. For this category that is
-- true of every row without exception: a pre-negotiated scene that removes
-- in-scene consent cues is the one kind of play where a silent mutual "yes" on
-- a checklist is not sufficient agreement. Setting it per-item here would imply
-- some of these are fine to discover in a compare view.
--
-- `cnc-roleplay` ALREADY EXISTS AND IS DELIBERATELY LEFT ALONE
--
-- The v1 seed put a single item `cnc-roleplay` ("CNC — consensual non-consent
-- roleplay") in `roleplay-fantasy`, on the give_receive axis, with a good
-- consent-forward description. Found by querying for slug collisions before
-- writing this seed — none of the 20 slugs below collides with it, so nothing
-- would have been silently reparented, but the concept overlap is real.
--
-- It stays, and the two are a deliberate two-level structure: `roleplay-fantasy`
-- asks "is this a thing for you at all", and this category asks "which of
-- these, and from which side". The wizard's per-category skip means a reader
-- who answered no to the umbrella is one click past the detail.
--
-- Deprecating an in-use item to make room for a new category is a larger
-- editorial call than a seed should make on its own, so this file does not make
-- it — and P7 asserts the row survives untouched, because an `on conflict
-- (slug) do update` is exactly the shape that would quietly move it.
--
-- SOURCE NOTE
--
-- The four groupings below (forced-encounter, coercion/pressure, psychological,
-- and fantasy framings) are the standard public taxonomy of this kink and are
-- used here only as a map of what a menu has to cover. All labels and
-- descriptions are written for this corpus; no wording is taken from any
-- external workbook.

-- ---------------------------------------------------------------------------
-- 1. Taxonomy version. Every seed in this family stamps one.
-- ---------------------------------------------------------------------------

insert into public.kink_taxonomy_versions (version, notes)
values (2, 'Adds the cnc-scenarios category for the consent-first negotiation workbook.')
on conflict (version) do update set notes = excluded.notes;

-- ---------------------------------------------------------------------------
-- 2. The category. sort_order 115 puts it immediately after power-dynamics
-- (110 in the v1 seed) — a reader meeting these scenarios has just answered
-- the power-exchange questions that frame them.
-- ---------------------------------------------------------------------------

insert into public.kink_categories (slug, label, description, axis, sort_order, added_in_version)
values (
  'cnc-scenarios',
  'Consensual non-consent scenarios',
  'Scenes negotiated in advance where resistance or refusal is part of the play. Each one is rated from both sides, because the two roles are not interchangeable.',
  'dom_sub',
  115,
  2
)
on conflict (slug) do update set
  label = excluded.label,
  description = excluded.description,
  axis = excluded.axis,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 3. The items. Every row carries its own definition, because a reader meeting
-- this list has to be able to tell two adjacent scenarios apart without
-- guessing, and every row is discussion_recommended.
-- ---------------------------------------------------------------------------

with cat as (select id, slug from public.kink_categories)
insert into public.kink_items
  (category_id, slug, label, description, discussion_recommended, sort_order, added_in_version)
select c.id, v.slug, v.label, v.description, true, v.sort_order, 2
from (values
  -- Forced-encounter framings.
  ('cnc-resistance-play',      'Resistance play',
   'Struggling, pushing back or trying to get away as part of the scene, with the outcome agreed beforehand.', 10),
  ('cnc-pinned-held-down',     'Being pinned or held down',
   'Physical restraint by body weight or grip rather than by rope or cuffs.', 20),
  ('cnc-forced-encounter',     'Staged forced encounter',
   'A scene framed as sex that one character does not agree to, scripted in advance by both people.', 30),
  ('cnc-somnophilia',          'Sleep or unconscious framing',
   'One person plays as asleep or unaware. Negotiated while both are awake, including how it ends.', 40),
  ('cnc-abduction',            'Abduction or capture scene',
   'Being taken, moved or confined as the premise of the scene.', 50),
  ('cnc-blind-scene',          'Unknown-script scene',
   'You agree the limits and the safeword but not the script, so what happens is a surprise inside an agreed boundary.', 60),

  -- Coercion and pressure framings.
  ('cnc-blackmail-framing',    'Blackmail or leverage framing',
   'A character is pressured into compliance by a threat that exists only inside the scene.', 70),
  ('cnc-authority-pressure',   'Authority-figure pressure',
   'A role with institutional power over the other (inspector, officer, officiant) applies it as the premise.', 80),
  ('cnc-transactional',        'Transactional framing',
   'Compliance exchanged for something: money, a favour, a grade, a job.', 90),
  ('cnc-no-safeword-illusion', 'Illusion of no way out',
   'The scene is played as though refusal is impossible, while a real safeword or signal stays live throughout.', 100),

  -- Psychological framings.
  ('cnc-fear-play',            'Fear play',
   'Deliberately producing dread or startle rather than pain. Easy to overshoot and hard to walk back.', 110),
  ('cnc-interrogation',        'Interrogation scene',
   'Questioning under pressure, with or without a secret to protect.', 120),
  ('cnc-captor-bond',          'Captor-bond framing',
   'Playing attachment to the person holding you. Worth naming explicitly before and unpicking after.', 130),
  ('cnc-mind-games',           'Mind games and misdirection',
   'Being lied to or misled inside the scene. Needs an explicit out-of-scene channel that is never part of the game.', 140),
  ('cnc-degradation-script',   'Scripted degradation',
   'Insults or humiliation written in advance, so the words used are chosen rather than improvised.', 150),

  -- Fantasy framings. Distance from reality is itself a safety lever.
  ('cnc-monster-creature',     'Monster or creature framing',
   'A non-human aggressor. The fictional frame is often what makes the scene playable at all.', 160),
  ('cnc-historical-ritual',    'Historical or ritual framing',
   'Inquisition, tribunal, sacrifice. Carries real history for many people. Check whose.', 170),
  ('cnc-institutional',        'Institutional framing',
   'Asylum, prison, boarding school, clinic. Check for a personal history with the real institution first.', 180),
  ('cnc-free-use',             'Free use within a window',
   'Standing agreement that one person may initiate at any time during an agreed window, with limits set in advance.', 190),
  ('cnc-public-stranger',      'Stranger or public framing',
   'Played as an encounter with someone unknown. If it involves anyone outside the agreement, it is not this.', 200)
) as v(slug, label, description, sort_order)
join cat c on c.slug = 'cnc-scenarios'
on conflict (slug) do update set
  label = excluded.label,
  description = excluded.description,
  discussion_recommended = true,
  sort_order = excluded.sort_order,
  is_active = true,
  deprecated_at = null;

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
  v_cat uuid;
begin
  select id into v_cat from public.kink_categories where slug = 'cnc-scenarios';
  if v_cat is null then
    raise exception 'P1 failed: cnc-scenarios category absent';
  end if;

  -- P1: the axis is dom_sub. On any other axis kink_compare pairs the wrong
  -- sides and a dominant-side yes would meet a dominant-side yes.
  select count(*) into v_bad
  from public.kink_categories
  where slug = 'cnc-scenarios' and axis = 'dom_sub' and is_active;
  if v_bad <> 1 then
    raise exception 'P1b failed: cnc-scenarios must be an active dom_sub category';
  end if;

  -- P2: 20 active items, each with its own description. A row with no
  -- description renders a bare label and the reader has to guess.
  select count(*) into v_bad
  from public.kink_items
  where category_id = v_cat and is_active
    and description is not null and length(btrim(description)) > 20;
  if v_bad <> 20 then
    raise exception 'P2 failed: expected 20 described active cnc items, found %', v_bad;
  end if;

  -- P3: every item is discussion_recommended. Not a default — the column
  -- defaults false, so a missed row would silently present a CNC scenario as
  -- safe to discover in a compare view.
  select count(*) into v_bad
  from public.kink_items
  where category_id = v_cat and is_active and not discussion_recommended;
  if v_bad <> 0 then
    raise exception 'P3 failed: % cnc item(s) are not discussion_recommended', v_bad;
  end if;

  -- P4: descriptions are distinct. One description pasted across a family is a
  -- defect this corpus has hit repeatedly, and here it would erase exactly the
  -- distinction between two scenarios a reader is being asked to rate apart.
  select count(distinct description) into v_bad
  from public.kink_items where category_id = v_cat and is_active;
  if v_bad <> 20 then
    raise exception 'P4 failed: expected 20 distinct descriptions, found %', v_bad;
  end if;

  -- P5: no label defines itself by its own name (the define-the-term-with-the-
  -- term defect). Checked as: no description is just the label again.
  select count(*) into v_bad
  from public.kink_items
  where category_id = v_cat and is_active
    and lower(btrim(description)) = lower(btrim(label));
  if v_bad <> 0 then
    raise exception 'P5 failed: % cnc item(s) define the term with the term', v_bad;
  end if;

  -- P6: MIRROR — the pre-existing taxonomy is intact. A seed that collided on
  -- a slug and overwrote an unrelated item would still satisfy P1-P5.
  --
  -- The floor is 15 against a measured 19 + 1, NOT 20. Twenty would be an
  -- exact-match precondition wearing a postcondition's clothes: a human who
  -- legitimately retires one category later would make this file abort
  -- `db push` for the whole repo. Fifteen still catches the failure this is
  -- for — a seed that collided and flattened the v1 taxonomy.
  select count(*) into v_bad from public.kink_categories where is_active;
  if v_bad < 15 then
    raise exception 'P6 failed: only % active categories, the v1 taxonomy lost rows', v_bad;
  end if;
  select count(*) into v_bad
  from public.kink_items i
  join public.kink_categories c on c.id = i.category_id
  where c.slug = 'power-dynamics' and i.is_active;
  if v_bad = 0 then
    raise exception 'P6b failed: power-dynamics lost all its items';
  end if;

  -- P7: the pre-existing cnc-roleplay item is UNTOUCHED — still active, still
  -- in roleplay-fantasy, still on its own axis. Named rather than counted,
  -- because it is the one row an `on conflict (slug) do update` in this seed
  -- could plausibly have reparented, and a category count cannot see a move.
  select count(*) into v_bad
  from public.kink_items i
  join public.kink_categories c on c.id = i.category_id
  where i.slug = 'cnc-roleplay'
    and c.slug = 'roleplay-fantasy'
    and i.is_active
    and i.deprecated_at is null;
  if v_bad <> 1 then
    raise exception 'P7 failed: cnc-roleplay was moved, deprecated or dropped, this seed must not touch it';
  end if;

  raise notice 'cnc_negotiation_taxonomy: P1-P7 pass (20 items, cnc-roleplay intact)';
end
$verify$;
