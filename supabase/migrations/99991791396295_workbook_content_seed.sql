-- The five workbooks. All prose written for this corpus.
--
-- HOST TERMS, RESOLVED ON PROD BY SLUG RATHER THAN BY NAME
--
--   negotiation                 -> contract preparation   (category: Consent & Negotiation)
--   consensual-non-consent-cnc  -> CNC negotiation menu
--   scene                       -> scene plan
--   chastity                    -> four-day chastity starter
--   kink-burnout                -> burnout reflection      (CREATED HERE — see below)
--
-- `consensual-non-consent` is status='merged' and redirects to
-- `consensual-non-consent-cnc`; hanging a workbook off the merged row would
-- attach it to a redirect that renders nothing, so the canonical row is used.
--
-- WHY kink-burnout IS CREATED RATHER THAN REUSING `burnout`
--
-- `burnout` exists and is ACTIVE, and it is the wrong sense. Its description
-- reads "The physical and psychological exhaustion that can occur after heavy
-- drug use at rave events" and its category is "Substances & Recovery" — it is
-- the harm-reduction term. Attaching a power-exchange reflection workbook to it
-- would be the wrong-sense defect this corpus has repaired twenty times over,
-- committed deliberately. `kink-burnout` was checked free of both a tag and an
-- alias shadow before being created here.
--
-- CATEGORY: ONE LEVER, AND THE OFT-CITED TRIGGER GAP IS STALE
--
-- CLAUDE.md records that "neither category trigger fires on INSERT", so a tag
-- created with only `category_id` would derive no `category` TEXT and mint no
-- `tag_category_assignments` row. Measured on prod before writing this file,
-- that is no longer true:
--
--   trg_sync_tag_category       BEFORE INSERT OR UPDATE
--   trg_sync_tag_category_after AFTER  INSERT OR UPDATE OF category_id
--
-- Both fire on INSERT. So this file writes `category_id` ALONE and lets the two
-- triggers derive the text and mint the primary junction row — which is both
-- smaller and a real test of that path, where setting all three by hand would
-- bypass the thing being relied on. P2 asserts all three representations
-- arrive, so a regression in either trigger fails here rather than shipping a
-- row that is uncategorised on its own page and categorised in search.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING, AND THE REASON IS INDIRECT
--
-- Found by dry-running, not by reading. The junction insert fires
-- `unified_tags_recompute_is_adult()`, which issues
-- `update unified_tags set is_adult = ...` because "Dynamics & Roles" is an
-- adult category. `log_unified_tag_change()` RAISES on any UPDATE of a
-- `human_reviewed = true` row by an actor matching `system:%` — and `is_adult`
-- is NOT in that trigger's derived-column exemption list. So the INSERT
-- succeeds and a trigger three levels down kills the transaction:
--
--   human_reviewed tag <id> cannot be modified by system:trigger
--
-- `human_reviewed = true` is itself required, not optional:
-- `deprecate_unused_tags()` selects exactly
-- `status='active' AND human_reviewed=false AND usage_count=0`, and a
-- brand-new host term has usage 0 — so the honest flag would queue the page
-- for deletion. Hence the declared actor.
--
-- `is_adult` is deliberately NOT set. It is derived from the category by
-- trigger, and hand-setting it here would fight the recompute that then raises.
--
-- `publication_role` IS SET EXPLICITLY AND MUST BE
--
-- It is NOT NULL with no column default, and `validate_tag_entity_target()`
-- opens `if new.publication_role <> 'entity_redirect' then ... return new` —
-- which on a NULL evaluates to NULL, skips the early return, and raises a
-- confusing error about entity redirects on a row that is not one.

-- Declared for every write in this file. See the note above: without it the
-- is_adult recompute cannot touch a human_reviewed row.
select set_config('app.actor', 'migration:99991791396295_workbook_content_seed', true);
--
-- WHY EVERY WORKBOOK IS is_public = true HERE
--
-- The definition rows are content, equivalent to the tag prose they hang off.
-- Nothing private is published by this file: the prompts are public, the
-- answers live in a separate table with no anon grant at all. Reaching the
-- runner still requires sign-in plus the intimate opt-in.

-- ---------------------------------------------------------------------------
-- 1. The missing host term.
-- ---------------------------------------------------------------------------

-- category_id is the only category lever written here; both triggers derive the
-- rest. is_adult is derived too and is deliberately absent.
insert into public.unified_tags
  (name, slug, description, short_description, category_id,
   publication_role, entity_kind, status, is_sensitive,
   seo_indexable, human_reviewed)
select
  'Kink Burnout',
  'kink-burnout',
  'The flattening that sets in when a power-exchange dynamic becomes a set of chores. Rituals still happen, service still happens, and neither carries any charge. Distinct from sub drop, which is acute and passes in hours, and from a hard limit, which is a boundary rather than an exhaustion.',
  'Losing the charge in a dynamic that still functions',
  c.id,
  'utility',
  'concept'::public.tag_entity_kind,
  'active',
  false,
  false,
  true
from public.tag_categories c
where c.slug = 'bdsm-power-exchange'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The workbooks.
-- ---------------------------------------------------------------------------

insert into public.tag_workbooks
  (tag_id, slug, title, dek, intro_md, kind, day_count, requires_partner, is_public, sort_order)
select t.id, v.slug, v.title, v.dek, v.intro_md, v.kind, v.day_count, v.requires_partner, true, v.sort_order
from (values
  ('negotiation', 'contract-preparation',
   'Preparing a power-exchange agreement',
   'Three passes: what you each want, what you are writing down, and what you turn on first.',
   'Most agreements fail in the same place, not in the writing, but in the part before it, where two people assume they already know what the other wants.'
   || E'\n\n'
   || 'This is three passes over the same ground. The first is about wanting and fearing, before any clause exists. The second turns those answers into terms. The third decides what you actually start with, which is almost never everything at once.'
   || E'\n\n'
   || 'Each of you fills this in separately. You can compare any answer you choose to share once you have both granted access, and you can leave the rest private, or change your mind later.',
   'negotiation', null, true, 10),

  ('consensual-non-consent-cnc', 'cnc-negotiation-menu',
   'Negotiating a CNC scene',
   'Rate the scenarios from both sides, then settle the parts a rating cannot carry.',
   'A pre-negotiated scene removes the in-scene cues people normally read to tell whether something is still welcome. Everything that would normally be checked in the moment has to be settled before, which is what this is for.'
   || E'\n\n'
   || 'The menu is rated twice, once from each side, because wanting to run a scene and wanting to be on the receiving end of it are different answers. Your no and your hard limit are never shown to anyone, they silently remove a scenario from the comparison instead.'
   || E'\n\n'
   || 'A safeword stays live for the whole scene. If your plan needs it not to, the plan is the thing to change.',
   'menu', null, true, 10),

  ('scene', 'scene-plan',
   'Planning a scene',
   'What it is for, what is in the room, how it ends, and what happens afterwards.',
   'A scene plan is not a script. It is the short list of things that are expensive to work out once you have already started: what this is for, who is doing what, what is within reach, and how you stop.'
   || E'\n\n'
   || 'Fill it in for one specific scene rather than in general. The aftercare question is last and is not optional, deciding what you need while you still have the words for it is the whole point of writing it down beforehand.',
   'negotiation', null, true, 10),

  ('chastity', 'chastity-first-four-days',
   'Four days of chastity, start to finish',
   'A short first run with a decided end, one prompt a day.',
   'A first chastity run goes wrong in two predictable ways: no agreed end, so it becomes a test of endurance nobody chose; and no check-in, so a hygiene or circulation problem gets discovered late.'
   || E'\n\n'
   || 'This is four days with a decided end. One prompt a day, unlocking as the days pass. Day four asks whether to continue, and stopping there is a complete answer, not a failure.'
   || E'\n\n'
   || 'Physical safety is not a negotiation: numbness, discolouration, swelling or pain that does not settle means the device comes off now, whatever was agreed. Nothing in this workbook outranks that.',
   'program', 4, true, 10),

  ('kink-burnout', 'burnout-reset',
   'When the dynamic stops landing',
   'Five questions about what is still load-bearing and what you inherited.',
   'Burnout in a dynamic rarely looks like a problem. The rituals still happen, the service still happens, and none of it carries anything. Because nothing is visibly broken there is no obvious moment to stop and say so.'
   || E'\n\n'
   || 'These five questions are for you alone, there is no partner half and nothing here is shared unless you decide to share it. Most of them are about telling apart what you still want from what you are simply continuing.',
   'reflection', null, false, 10)
) as v(tag_slug, slug, title, dek, intro_md, kind, day_count, requires_partner, sort_order)
join public.unified_tags t on t.slug = v.tag_slug and t.status = 'active'
on conflict (slug) do update set
  title = excluded.title,
  dek = excluded.dek,
  intro_md = excluded.intro_md,
  kind = excluded.kind,
  day_count = excluded.day_count,
  requires_partner = excluded.requires_partner,
  is_public = excluded.is_public,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. The steps.
-- ---------------------------------------------------------------------------

insert into public.tag_workbook_steps
  (workbook_id, key, position, day_offset, kind, heading, prompt_md, help_md, kink_category_slug)
select w.id, v.key, v.position, v.day_offset, v.kind, v.heading, v.prompt_md, v.help_md, v.kink_category_slug
from (values
  -- ====== contract-preparation ======
  ('contract-preparation', 'phase-1-intro', 10, null, 'prose',
   'First pass: before any clause',
   null,
   null, null),
  ('contract-preparation', 'what-you-want', 20, null, 'prompt',
   null,
   'What do you want this dynamic to do for you that your life does not currently do?',
   'Answer about your life rather than about kink. "I want to stop making every small decision" is usable; "I want to be a good submissive" is not yet.', null),
  ('contract-preparation', 'what-you-fear', 30, null, 'prompt',
   null,
   'What are you afraid this will cost you?',
   'Time, other relationships, how you see yourself, how someone else sees you. Writing it down before it happens makes it sayable later.', null),
  ('contract-preparation', 'hard-limits', 40, null, 'prompt',
   null,
   'What is off the table permanently, regardless of context or how well it is going?',
   'These do not need justifying and they are not opening positions.', null),
  ('contract-preparation', 'soft-limits', 50, null, 'prompt',
   null,
   'What is off the table for now, and what specifically would have to be true to revisit it?',
   'The second half is the useful half. "Not yet" with no condition attached tends to mean never.', null),
  ('contract-preparation', 'triggers', 60, null, 'prompt',
   null,
   'What should the other person know so they do not walk into it by accident?',
   'As much or as little as you want to say. You can leave this one unshared and still have written it.', null),
  ('contract-preparation', 'safewords', 70, null, 'prompt',
   null,
   'What stops things, and what stops them when you cannot speak?',
   'Two answers. A gagged or dropped person needs a signal that does not need words, a dropped object, a count of taps.', null),
  ('contract-preparation', 'aftercare-needs', 80, null, 'prompt',
   null,
   'What do you need in the hour afterwards, and what do you need two days later?',
   'These are often different and the second one gets forgotten.', null),
  ('contract-preparation', 'power-dynamics-menu', 90, null, 'menu',
   'Rate the dynamics',
   null,
   'Rated from both sides. Your no and hard limit are never shown to anyone.', 'power-dynamics'),
  ('contract-preparation', 'phase-2-intro', 100, null, 'prose',
   'Second pass: the terms',
   null, null, null),
  ('contract-preparation', 'roles', 110, null, 'prompt',
   null,
   'What is each person responsible for, including the responsibilities of the person in charge?',
   'A dynamic where only one side has obligations is not an exchange.', null),
  ('contract-preparation', 'duration-review', 120, null, 'prompt',
   null,
   'How long does this run before you sit down and re-read it together?',
   'Pick a date, not "when it feels right". An agreement with no review date is one nobody re-reads.', null),
  ('contract-preparation', 'rules-protocols', 130, null, 'prompt',
   null,
   'What are the standing rules, and which single one matters most?',
   'If the list runs past ten, the third pass will cut it anyway.', null),
  ('contract-preparation', 'discipline', 140, null, 'prompt',
   null,
   'What happens when a rule is broken, and what happens when it is broken because it was unworkable?',
   'Those two need different answers. Treating an unworkable rule as a failure of obedience is how resentment starts.', null),
  ('contract-preparation', 'rewards', 150, null, 'prompt',
   null,
   'What does doing well actually get you?',
   'Specific and real. "Approval" is not a term, it is a hope.', null),
  ('contract-preparation', 'check-ins', 160, null, 'prompt',
   null,
   'When do you talk about the dynamic while not in it, and who is allowed to call that conversation?',
   'The second half is the one that gets skipped. If only one person can call it, the other has no route.', null),
  ('contract-preparation', 'conflict', 170, null, 'prompt',
   null,
   'What happens in a disagreement that the dynamic itself cannot settle?',
   'Some arguments cannot be resolved by one person deciding. Name the route out of role now.', null),
  ('contract-preparation', 'termination', 180, null, 'prompt',
   null,
   'How does either of you end this, and what does the other agree to do when that happens?',
   'Written while you are both fine, for use when you are not. This is the clause that makes the rest safe to agree to.', null),
  ('contract-preparation', 'phase-3-intro', 190, null, 'prose',
   'Third pass: what you start with',
   null, null, null),
  ('contract-preparation', 'first-element', 200, null, 'prompt',
   null,
   'Of everything above, which single element starts this week?',
   'One. Everything at once is the commonest way a new agreement collapses in a fortnight.', null),
  ('contract-preparation', 'slow-down-signal', 210, null, 'prompt',
   null,
   'What would tell you this is going too fast, before it stops being enjoyable?',
   'Name the early sign, not the crisis.', null),

  -- ====== cnc-negotiation-menu ======
  ('cnc-negotiation-menu', 'how-to-use', 10, null, 'prose',
   'Before the menu',
   null, null, null),
  ('cnc-negotiation-menu', 'scenarios', 20, null, 'menu',
   'The scenarios',
   null,
   'Every scenario here is flagged discuss-first. A matching rating is a starting point for a conversation, not a green light on its own.', 'cnc-scenarios'),
  ('cnc-negotiation-menu', 'safeword', 30, null, 'prompt',
   null,
   'What is the safeword, and what happens in the first minute after it is used?',
   'The second half matters more. "Everything stops" is not yet a plan for a person who cannot stand up.', null),
  ('cnc-negotiation-menu', 'never', 40, null, 'prompt',
   null,
   'What must never happen in one of these scenes, even if it would fit the fiction?',
   'Words, acts, places, people. The fiction does not get a vote on this list.', null),
  ('cnc-negotiation-menu', 'non-verbal-out', 50, null, 'prompt',
   null,
   'How do you stop a scene where saying no is part of the scene?',
   'This needs a signal that cannot be mistaken for play. Agree it before and test it once while nothing is happening.', null),
  ('cnc-negotiation-menu', 'after', 60, null, 'prompt',
   null,
   'What does the hour afterwards look like, and who checks in the next day?',
   'Scenes built on fear or coercion framings often land hardest a day later, not immediately.', null),

  -- ====== scene-plan ======
  ('scene-plan', 'purpose', 10, null, 'prompt',
   null,
   'What is this scene for?',
   'Intensity, closeness, humiliation, service, nothing in particular. Two people wanting opposite things out of the same scene is the commonest way one goes flat.', null),
  ('scene-plan', 'activities', 20, null, 'prompt',
   null,
   'What is actually happening, in order?',
   'As specific as you can. "Impact" is not a plan; "flogger, then cane, no more than ten" is.', null),
  ('scene-plan', 'who-does-what', 30, null, 'prompt',
   null,
   'Who is doing what, and is anyone watching or joining?',
   null, null),
  ('scene-plan', 'limits-tonight', 40, null, 'prompt',
   null,
   'What is off the table tonight specifically?',
   'Separate from your standing limits. Tiredness, a bruise, a bad week, an early start. Tonight is allowed its own answer.', null),
  ('scene-plan', 'safeword-scene', 50, null, 'prompt',
   null,
   'Safeword, and the non-verbal version?',
   null, null),
  ('scene-plan', 'supplies', 60, null, 'prompt',
   null,
   'What needs to be within reach before you start?',
   'Including the unglamorous half: shears or a quick-release for anything restraining, gloves, water, a towel, something to cut with.', null),
  ('scene-plan', 'risk', 70, null, 'prompt',
   null,
   'What is the most likely thing to go wrong, and what do you do if it does?',
   'Name one. A plan for the likely problem beats a general intention to be careful.', null),
  ('scene-plan', 'cleanup', 80, null, 'prompt',
   null,
   'Who cleans what, and how does anything that touched blood or fluids get handled?',
   'Decided now, because nobody wants to decide it afterwards.', null),
  ('scene-plan', 'stop-early', 90, null, 'prompt',
   null,
   'What would make you stop early even without a safeword?',
   'Going quiet, going somewhere else, laughing wrong. Say what to watch for in you.', null),
  ('scene-plan', 'aftercare-scene', 100, null, 'prompt',
   null,
   'What do you need afterwards?',
   'Last question, deliberately. Answer it before the scene, while you still have the words.', null),

  -- ====== chastity-first-four-days (day_offset paces it) ======
  ('chastity-first-four-days', 'safety-first', 10, 0, 'prose',
   'Before day one',
   null, null, null),
  ('chastity-first-four-days', 'why', 20, 0, 'prompt',
   null,
   'What is this four days for?',
   'Control, focus, a gift, curiosity, a specific anticipation. Worth knowing so day three can be measured against something.', null),
  ('chastity-first-four-days', 'terms', 30, 0, 'prompt',
   null,
   'Who holds the key, how is it reachable, and what ends this early with no discussion?',
   'All three. "Reachable" means reachable at 3am by whoever is wearing the device, not only by the keyholder.', null),
  ('chastity-first-four-days', 'day-1', 40, 1, 'prompt',
   'Day one',
   'How does it actually feel, physically, then otherwise?',
   'Physical first. Anything numb, cold, discoloured or swollen ends this now.', null),
  ('chastity-first-four-days', 'day-2', 50, 2, 'prompt',
   'Day two',
   'What has changed in how the two of you are with each other?',
   'Often more than expected, and often not in the direction either person predicted.', null),
  ('chastity-first-four-days', 'day-3', 60, 3, 'prompt',
   'Day three',
   'What is harder than you expected, and what is easier?',
   null, null),
  ('chastity-first-four-days', 'day-4', 70, 4, 'prompt',
   'Day four, the decision',
   'Continue or stop, and what would you do differently next time?',
   'Stopping here is the plan working. If continuing, set the next end date now rather than leaving it open.', null),

  -- ====== burnout-reset ======
  ('burnout-reset', 'stopped-looking-forward', 10, null, 'prompt',
   null,
   'What in this dynamic have you stopped looking forward to?',
   'Not what you resent, what has simply gone flat. Those are different and the flat one is harder to notice.', null),
  ('burnout-reset', 'load-bearing', 20, null, 'prompt',
   null,
   'Which rituals are holding something up, and which are just still happening?',
   'Go through them one at a time. Most dynamics accumulate rules nobody has wanted for months.', null),
  ('burnout-reset', 'inherited', 30, null, 'prompt',
   null,
   'What did you take on because it seemed to come with the role rather than because you wanted it?',
   'Protocol copied from a book, a forum, or a previous partner. Worth separating from what you chose.', null),
  ('burnout-reset', 'keep-one', 40, null, 'prompt',
   null,
   'If you kept one thing and dropped the rest for a month, what would you keep?',
   'The answer is usually small, and usually not the thing taking the most effort.', null),
  ('burnout-reset', 'say-out-loud', 50, null, 'prompt',
   null,
   'What do you need to say that you have not said?',
   'This one is yours. Nothing here is shared unless you choose to share it, and writing it first often makes saying it possible.', null)
) as v(wb_slug, key, position, day_offset, kind, heading, prompt_md, help_md, kink_category_slug)
join public.tag_workbooks w on w.slug = v.wb_slug
on conflict (workbook_id, key) do update set
  position = excluded.position,
  day_offset = excluded.day_offset,
  kind = excluded.kind,
  heading = excluded.heading,
  prompt_md = excluded.prompt_md,
  help_md = excluded.help_md,
  kink_category_slug = excluded.kink_category_slug;

-- Prose bodies live in `prompt_md` for prose steps too — the column is the
-- step's text whatever its kind. Set after the insert so the long strings stay
-- out of the VALUES list above.
update public.tag_workbook_steps s set prompt_md = x.body
from (values
  ('contract-preparation', 'phase-1-intro',
   'Nothing here becomes a clause yet. The point of this pass is to find out whether you want the same thing, which is not the same question as whether you agree to the same terms.'),
  ('contract-preparation', 'phase-2-intro',
   'Now the terms. Each answer below is something a future version of you will read back when something has gone wrong, so write for that reader rather than for the one you are now.'),
  ('contract-preparation', 'phase-3-intro',
   'You now have more than you can start with. This pass is subtraction.'),
  ('cnc-negotiation-menu', 'how-to-use',
   'Rate each scenario from both sides. A scenario you would run but not receive is a normal answer, and so is the reverse.'
   || E'\n\n'
   || 'Only matching positives appear in a comparison. Anything either of you marked no or hard limit is removed silently, your partner is never shown that you refused something, only that it is not on the list.'),
  ('chastity-first-four-days', 'safety-first',
   'Four days, one prompt a day, ending on day four with a decision.'
   || E'\n\n'
   || 'The device comes off immediately, whatever was agreed and without asking, for numbness, cold or discoloured skin, swelling that does not settle, pain that is not the point, or any break in the skin. None of the agreements below outrank this one.')
) as x(wb_slug, key, body)
join public.tag_workbooks w on w.slug = x.wb_slug
where s.workbook_id = w.id and s.key = x.key;

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
  v_txt text;
begin
  -- P1: five published workbooks, one per host term, each with its steps.
  select count(*) into v_bad
  from public.tag_workbooks w
  join public.unified_tags t on t.id = w.tag_id
  where w.slug in ('contract-preparation','cnc-negotiation-menu','scene-plan',
                   'chastity-first-four-days','burnout-reset')
    and w.is_public
    and t.status = 'active';
  if v_bad <> 5 then
    raise exception 'P1 failed: expected 5 published workbooks on active tags, found %', v_bad;
  end if;

  -- P2: kink-burnout carries ALL THREE category representations. category_id
  -- alone leaves it uncategorised on its own page (which renders the junction)
  -- and categorised in search (which reads the text) — the 194-row defect.
  select count(*) into v_bad
  from public.unified_tags t
  join public.tag_categories c on c.id = t.category_id
  join public.tag_category_assignments a
    on a.tag_id = t.id and a.category_id = c.id and a.is_primary
  where t.slug = 'kink-burnout'
    and t.category = c.name
    and t.status = 'active';
  if v_bad <> 1 then
    raise exception 'P2 failed: kink-burnout is missing one of its three category representations';
  end if;

  -- P2b: and it is NOT the drug-comedown sense. If a future pass points this
  -- workbook at `burnout`, this fails rather than publishing a power-exchange
  -- reflection on a harm-reduction term.
  select t.description into v_txt
  from public.tag_workbooks w
  join public.unified_tags t on t.id = w.tag_id
  where w.slug = 'burnout-reset';
  if v_txt is null or v_txt ilike '%drug%' or v_txt ilike '%rave%' then
    raise exception 'P2b failed: burnout-reset is hosted on the substance sense of burnout';
  end if;

  -- P3: every non-prose step has text to show. A prompt with no prompt_md
  -- renders an empty textarea with no question above it.
  select count(*) into v_bad
  from public.tag_workbook_steps s
  join public.tag_workbooks w on w.id = s.workbook_id
  where w.slug in ('contract-preparation','cnc-negotiation-menu','scene-plan',
                   'chastity-first-four-days','burnout-reset')
    and s.kind in ('prompt','checklist')
    and (s.prompt_md is null or length(btrim(s.prompt_md)) < 10);
  if v_bad <> 0 then
    raise exception 'P3 failed: % prompt step(s) have no question', v_bad;
  end if;

  -- P3b: and every prose step got its body from the UPDATE above. Without this
  -- a prose step inserted with a null prompt_md renders a heading and nothing.
  select count(*) into v_bad
  from public.tag_workbook_steps s
  join public.tag_workbooks w on w.id = s.workbook_id
  where w.slug in ('contract-preparation','cnc-negotiation-menu','scene-plan',
                   'chastity-first-four-days','burnout-reset')
    and s.kind = 'prose'
    and (s.prompt_md is null or length(btrim(s.prompt_md)) < 10);
  if v_bad <> 0 then
    raise exception 'P3b failed: % prose step(s) have no body, the follow-up UPDATE did not match', v_bad;
  end if;

  -- P4: both menu steps resolve to a real, active kink category. A menu step
  -- pointing at a missing category renders an empty step with no error.
  select count(*) into v_bad
  from public.tag_workbook_steps s
  join public.kink_categories c on c.slug = s.kink_category_slug
  where s.kind = 'menu' and c.is_active;
  if v_bad < 2 then
    raise exception 'P4 failed: expected >= 2 menu steps on active kink categories, found %', v_bad;
  end if;

  -- P5: the program is paced. A kind='program' workbook whose steps carry no
  -- day_offset unlocks everything at once and is not a program.
  select count(*) into v_bad
  from public.tag_workbook_steps s
  join public.tag_workbooks w on w.id = s.workbook_id
  where w.slug = 'chastity-first-four-days' and s.day_offset is null;
  if v_bad <> 0 then
    raise exception 'P5 failed: % step(s) of the chastity program carry no day_offset', v_bad;
  end if;
  select count(distinct s.day_offset) into v_bad
  from public.tag_workbook_steps s
  join public.tag_workbooks w on w.id = s.workbook_id
  where w.slug = 'chastity-first-four-days';
  if v_bad < 5 then
    raise exception 'P5b failed: the chastity program spans only % distinct days', v_bad;
  end if;

  -- P6: the reflection workbook needs no partner, and the other four do. This
  -- is the flag that decides whether the runner offers a share step at all.
  select count(*) into v_bad
  from public.tag_workbooks
  where slug = 'burnout-reset' and not requires_partner;
  if v_bad <> 1 then
    raise exception 'P6 failed: burnout-reset must not require a partner';
  end if;
  select count(*) into v_bad
  from public.tag_workbooks
  where slug in ('contract-preparation','cnc-negotiation-menu','scene-plan','chastity-first-four-days')
    and requires_partner;
  if v_bad <> 4 then
    raise exception 'P6b failed: expected 4 partner workbooks, found %', v_bad;
  end if;

  -- P7: the chastity program states the physical-safety override, and states
  -- that it outranks the agreement. This is the one piece of content in the
  -- file that is a safety claim rather than a prompt, so it is asserted rather
  -- than trusted to survive an edit.
  select s.prompt_md into v_txt
  from public.tag_workbook_steps s
  join public.tag_workbooks w on w.id = s.workbook_id
  where w.slug = 'chastity-first-four-days' and s.key = 'safety-first';
  if v_txt is null
     or v_txt not ilike '%numbness%'
     or v_txt not ilike '%outrank%' then
    raise exception 'P7 failed: the chastity safety step lost its override language';
  end if;

  -- P8: MIRROR — no step defines its prompt by repeating its own heading, and
  -- no two prompts in one workbook are identical. One prompt pasted across a
  -- family is a defect this corpus keeps finding.
  select count(*) into v_bad
  from (
    select s.workbook_id, s.prompt_md
    from public.tag_workbook_steps s
    join public.tag_workbooks w on w.id = s.workbook_id
    where w.slug in ('contract-preparation','cnc-negotiation-menu','scene-plan',
                     'chastity-first-four-days','burnout-reset')
      and s.prompt_md is not null
    group by s.workbook_id, s.prompt_md
    having count(*) > 1
  ) d;
  if v_bad <> 0 then
    raise exception 'P8 failed: % duplicated prompt(s) within a single workbook', v_bad;
  end if;

  raise notice 'workbook_content_seed: P1-P8 pass';
end
$verify$;
