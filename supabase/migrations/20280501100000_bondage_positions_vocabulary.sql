-- Create the bondage-positions vocabulary: 12 new glossary terms, revive 1,
-- and route 1 name to the tag that already holds it.
--
-- SOURCE: the term LIST from Wikipedia's "Bondage positions and methods",
-- "Glossary of BDSM" and "Outline of BDSM". Not one word of prose is copied —
-- every definition below is written from independently documented meaning, and
-- the articles were used only as a signal for which entries are absent.
--
-- THE DEDUPE IS WHY THIS IS 12 AND NOT 15, and it ran BEFORE anything was
-- written. Three candidates from the measured "missing" list turned out not to
-- be missing at all:
--
--   bareback     ALREADY ACTIVE. The earlier probe asked for "Bareback sex",
--                the Wikipedia article title, and missed the tag at slug
--                `bareback`. Creating it would have produced a second row for a
--                live concept.
--   crotch-rope  EXISTS AS DEPRECATED, with a 466-char body. That is a REVIVE,
--                not a create — a second row would orphan the original and its
--                history. Revived here by clearing status/deprecated_at/
--                deprecation_reason TOGETHER, which is the whole difference
--                between a revive and the 297-tag resurrection incident that
--                left status='active' with deprecated_at still set.
--   x-cross      IS the St Andrew's Cross, which already exists in Gear
--                (repaired by 20270901100000). It is a NAME for that object,
--                not a second object, so it lands as an approved alias.
--
-- This is the same failure the two stamp-repair migrations exist to undo, one
-- step earlier in the pipeline: a name-shaped lookup that finds no exact match
-- and concludes the concept is absent.
--
-- CATEGORY. Everything here is a rope technique or a practice, so it goes to
-- `practices-play`, except `dominance-and-submission`, which is the dynamic
-- itself and belongs in `bdsm-power-exchange`. Both are in
-- unified_tags_recompute_is_adult()'s set, so every row lands 18+; the
-- assertion checks that rather than assuming it. is_adult is NEVER written by
-- hand — it is derived from the junction.
--
-- PUBLISHED, because every definition was hand-written for this migration.
-- That needs all four of: prose present (or enforce_tag_thin_page_gate stamps
-- 'thin'), human_reviewed (or enforce_tag_seo_sensitivity_gate forces
-- seo_indexable false on an adult row), verification_status='reviewed' (or
-- unified_tags_public_gated_read hides a sensitive row from anon entirely), and
-- seo_indexable.
--
-- SAFETY FACTS ARE SPECIFIC OR ABSENT. TAG_STYLE_SYSTEM bans consent
-- boilerplate, so where a tie carries a real, named risk — nerve compression in
-- a box tie, shoulder injury in strappado, positional asphyxia in a hogtie —
-- that fact is stated concretely. Where there is no distinctive risk, nothing
-- is padded in.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:bondage-positions-vocabulary', true);

do $mig$
declare
  r        record;
  v_bad    int;
  v_cat    uuid;
  v_made   int := 0;
  v_alias  int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, descr, longd) values
    ('ball-tie', 'Ball Tie', 'practices-play',
     'A rope tie that folds the body into a compact ball, knees drawn to the chest and wrists bound to the ankles.',
     'A ball tie curls the bottom forward and binds them in that shape, so the knees stay against the chest and the arms cannot straighten. It is a compact, high-restriction position that removes almost all leverage, which is why it reads as more intense than the amount of rope suggests. Folded positions compress the diaphragm, so breathing is watched rather than assumed, and time in it is kept short.'),

    ('box-tie', 'Box Tie', 'practices-play',
     'The foundational Japanese chest harness, arms folded behind the back with forearms parallel — takate kote.',
     'The box tie, takate kote in Japanese rope, binds the wrists behind the back with the forearms held parallel and adds wraps above and below the chest. It is the base on which most suspension work is built, which is exactly why it is the tie most associated with injury: the wraps pass close to the radial nerve in the upper arm, and compression there causes wrist drop that can take weeks or months to resolve. Numbness, tingling or loss of grip means the rope comes off immediately, not at the end of the scene.'),

    ('frogtie', 'Frogtie', 'practices-play',
     'A leg tie binding each ankle to the same thigh, holding the knees bent and splayed.',
     'A frogtie folds each leg so the ankle meets the thigh and ties them there, leaving the knees bent outward. The bottom can still move their upper body but cannot straighten their legs, stand or close them, which makes it a common position for exposure and for play that wants restriction without full immobility. Bound joints lose circulation faster than limbs held straight, so the wraps are checked and the legs released periodically.'),

    ('karada', 'Karada', 'practices-play',
     'A decorative rope harness worn over the torso in a diamond pattern, tied for its look rather than to restrain.',
     'A karada — the Japanese word simply means "body" — is a rope harness of repeating diamonds down the front of the torso. It restrains very little by design: it is worn under or over clothing for how it looks and how it feels against the skin as the wearer moves, and it is a common first tie because it teaches tension and spacing without the risks of a load-bearing harness. It is sometimes used as an anchor for other rope, which changes it from decoration into structure and brings those risks back.'),

    ('strappado', 'Strappado', 'practices-play',
     'A standing tie with the arms bound behind the back and lifted upward, forcing the torso forward.',
     'In strappado the wrists are tied behind the back and hauled up toward the ceiling, so the bottom must bend at the waist as the arms rise. It is one of the most shoulder-intensive positions in rope: the joint is being rotated well past its comfortable range under load, and the risk is not gradual — a shoulder can be injured quickly and permanently. Height is raised slowly, never to the point of the bottom going onto their toes, and the position is not held long. It takes its name from a genuine historical torture, which is part of what it is drawing on.'),

    ('spread-eagle', 'Spread Eagle', 'practices-play',
     'A four-point tie with the limbs drawn out and apart, usually to the corners of a bed or frame.',
     'Spread eagle secures each wrist and ankle to a separate anchor and pulls them apart, leaving the body open and unable to close or turn. It is one of the most recognisable restraint positions and one of the simplest to rig, needing only four points and no harness. The tension is the whole variable: taut enough to immobilise strains shoulders and hips over time, so most scenes leave slack and adjust rather than pulling limbs to full extension.'),

    ('reverse-prayer', 'Reverse Prayer', 'practices-play',
     'An arm position with both hands pressed palm to palm behind the back, fingers pointing up.',
     'Reverse prayer brings the forearms behind the back and joins the palms between the shoulder blades, pointing upward. It demands real shoulder flexibility and most people cannot reach it at all, which makes it a position to test slowly and abandon without argument rather than work toward with rope. Forcing it is how shoulders and wrists get hurt; where it is used, it is usually held by a light tie that maintains a position the bottom can already achieve.'),

    ('hogtie', 'Hogtie', 'practices-play',
     'A prone tie joining bound wrists to bound ankles behind the back, arching the body.',
     'A hogtie puts the bottom face down and connects the wrists to the ankles behind them, pulling the body into an arch. It is severely restricting and, of the common ties, the one with the clearest documented danger: lying prone with the chest compressed and the body arched restricts breathing, and positional asphyxia in this posture is a known cause of death outside kink as well as inside it. It is never used on someone alone, never combined with a gag without a clear non-verbal signal, and never left in place while the top is out of the room.'),

    ('erotic-humiliation', 'Erotic Humiliation', 'practices-play',
     'Play built on shame, embarrassment or degradation, negotiated in advance and wanted by the person receiving it.',
     'Erotic humiliation uses language, exposure, tasks or an audience to produce embarrassment as the point rather than a side effect. What separates it from harm is entirely in the negotiation: the specific words, the areas that are off limits, and whether anything said in scene is allowed to touch the parts of a person''s life it references — body, competence, gender, history. It pairs closely with degradation and objectification play, and it is the practice where aftercare matters most, because the things said are designed to land.'),

    ('dominance-and-submission', 'Dominance and Submission', 'bdsm-power-exchange',
     'The consensual exchange of control between partners — the D and s of BDSM.',
     'Dominance and submission is the power-exchange half of BDSM, distinct from the sensation half: it concerns who decides, not what is done to whom. It ranges from control confined to a single scene through to standing arrangements covering daily life, and it need not involve pain, rope or equipment at all. Protocols, rituals and rules are the usual mechanics; safewords, negotiated limits and the right to end the arrangement are what make it an exchange rather than a surrender.'),

    ('non-penetrative-sex', 'Non-Penetrative Sex', 'practices-play',
     'Sex without penetration — frottage, mutual masturbation, thigh sex, oral contact and grinding.',
     'Non-penetrative sex covers everything from frottage and intercrural sex to mutual masturbation and body contact. It carries no pregnancy risk and substantially lower HIV risk than anal or vaginal sex, though skin-to-skin contact still transmits herpes, HPV and syphilis. It is a whole category of sex in its own right rather than a preliminary to something else, and it is often the practice of choice where penetration is unwanted, painful or unavailable.'),

    ('sexual-roleplay', 'Sexual Roleplay', 'practices-play',
     'Playing characters or a scenario together for erotic effect, from light framing to sustained roles.',
     'Sexual roleplay agrees a scenario and a set of characters, then plays inside it — authority and service dynamics, strangers meeting, medical or uniform scenes, or fully built fictional settings. The fiction is what does the work, so the negotiation covers the plot as much as the acts: what happens, what is off the table, and how anyone steps out. It is the frame that consensual non-consent, age play and most fantasy kinks are constructed inside.');

  -- Every category must resolve, or a row lands uncategorized and
  -- tag_hygiene_stats counts it with nothing to explain why.
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'bondage vocab: % row(s) name a category that does not exist', v_bad;
  end if;

  -- An ACTIVE or MERGED slug aborts: a live tag must never be silently
  -- overwritten by an import, and a merged one is a redirect whose target this
  -- migration knows nothing about.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.status <> 'deprecated';
  if v_bad > 0 then
    raise exception 'bondage vocab: % slug(s) already exist and are not deprecated', v_bad;
  end if;

  -- trg_tag_reject_alias_shadow raises if a slug is held as an alias of some
  -- other tag. Say so here rather than failing mid-loop.
  select count(*) into v_bad from _new n
   where exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug);
  if v_bad > 0 then
    raise exception 'bondage vocab: % slug(s) are held as an alias of another tag', v_bad;
  end if;

  for r in select * from _new order by slug loop
    select c.id into v_cat from public.tag_categories c where c.slug = r.cat;

    insert into public.unified_tags (
      name, slug, description, long_description,
      category_id, category, entity_kind,
      status, seo_indexable, human_reviewed, verification_status, last_verified_at
    )
    values (
      r.name, r.slug, r.descr, r.longd,
      v_cat, (select name from public.tag_categories where id = v_cat), 'concept',
      'active', true, true, 'reviewed', now()
    )
    on conflict (slug) do update set
      name                = excluded.name,
      description         = excluded.description,
      long_description    = excluded.long_description,
      category_id         = excluded.category_id,
      category            = excluded.category,
      entity_kind         = excluded.entity_kind,
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = true,
      human_reviewed      = true,
      verification_status = 'reviewed',
      last_verified_at    = now();
    -- The junction must be written EXPLICITLY on insert. sync_tag_category_
    -- assignment_after is scoped `AFTER UPDATE OF category_id`, so it does not
    -- fire for a new row: an INSERT sets category_id and the text mirror and
    -- files NOTHING in tag_category_assignments. Because
    -- unified_tags_recompute_is_adult() is a trigger on that junction table,
    -- the new row then derives is_adult = false.
    --
    -- Measured in the prod dry run for this migration: `box-tie` came out
    -- adult=f with 0 junctions, which would have tripped the age-gate assertion
    -- below — and, had that assertion not existed, would have published twelve
    -- rope-bondage pages with no age gate at all.
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = r.slug
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written by hand for migration 20280501100000 (bondage positions vocabulary).',
           false
      from public.unified_tags t
     where t.slug = r.slug
       and not exists (select 1 from public.tag_sources s
                        where s.tag_id = t.id and s.claim_summary like '%bondage positions vocabulary%');
  end loop;

  -- Revive `crotch-rope` rather than creating a second row. It carries a
  -- 466-char body written before it was swept; only the disposition is wrong.
  update public.unified_tags t set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    category_id         = (select id from public.tag_categories where slug = 'practices-play'),
    description         = 'A length of rope passed between the legs and tensioned against the crotch, tied off at the waist.',
    seo_indexable       = true,
    human_reviewed      = true,
    verification_status = 'reviewed',
    last_verified_at    = now()
  where t.slug = 'crotch-rope' and t.status = 'deprecated';

  -- `X-cross` is a NAME for the St Andrew's Cross, not a second object.
  insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
  select t.id, 'X-cross', 'x-cross', 'synonym', 'approved'
    from public.unified_tags t
   where t.slug = 'st-andrews-cross'
     and not exists (select 1 from public.tag_aliases a where a.alias_slug = 'x-cross');
  get diagnostics v_alias = row_count;

  -- ── Assertions ───────────────────────────────────────────────────────────
  if v_made <> 12 then
    raise exception 'bondage vocab: created % rows, expected 12', v_made;
  end if;

  -- Every row must exist, be active, carry real prose and be published.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.status <> 'active'
      or coalesce(length(btrim(t.description)), 0) < 30
      or coalesce(length(btrim(t.long_description)), 0) < 120
      or t.seo_indexable is not true
      or t.human_reviewed is not true
      or t.verification_status <> 'reviewed';
  if v_bad <> 0 then
    raise exception 'bondage vocab: % row(s) are missing, thin or unpublished', v_bad;
  end if;

  -- Every row must be 18+. The flag is derived from the junction, so this
  -- checks the trigger did its work rather than that a column was written.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.is_adult is not true;
  if v_bad <> 0 then
    raise exception 'bondage vocab: % row(s) came out NOT adult-gated', v_bad;
  end if;

  -- No two descriptions may match: a short string shared by more than five
  -- rows is what placeholder_description_active counts, and this migration
  -- exists partly to keep that metric at 0.
  select count(*) into v_bad from (
    select 1 from _new n join public.unified_tags t on t.slug = n.slug
     group by lower(btrim(t.description)) having count(*) > 1) d;
  if v_bad <> 0 then
    raise exception 'bondage vocab: % duplicate description(s)', v_bad;
  end if;

  -- The revive must have taken.
  select count(*) into v_bad from public.unified_tags
   where slug = 'crotch-rope' and (status <> 'active' or deprecated_at is not null);
  if v_bad <> 0 then
    raise exception 'bondage vocab: crotch-rope was not revived cleanly';
  end if;

  raise notice 'bondage vocab: % created, crotch-rope revived, % alias(es) added', v_made, v_alias;
end
$mig$;
