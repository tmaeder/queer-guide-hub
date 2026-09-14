-- The rope TECHNIQUE and rope SAFETY layer is missing, while the glossary
-- carries a dozen "rope <animal>" persona coinages. 16 new terms, 1 revive,
-- 11 aliases.
--
-- SOURCE: the term LISTS from rebornropes.com's A-Z rope glossary, its "A is
-- for" page and its positions page, plus the four general kink glossaries
-- compared in 50200101100500. Not one word of prose below is copied — the
-- lists were used only as a signal for what is absent.
--
-- WHAT THE COMPARISON ACTUALLY FOUND. The general kink vocabulary is in good
-- shape: impact / sensation / temperature / wax / knife / breath / fire / blood
-- play, protocol, high protocol, collaring, subspace, sub drop, munch, play
-- party, dungeon monitor, primal / pony / puppy play, objectification, human
-- furniture, key holder, chastity device and free use are all ACTIVE. So is the
-- consent layer — consent, safe word, hard limits, soft limits, SSC, PRICK,
-- RACK, safe call, vetting, spotter, rope compatibility checks.
--
-- The gap is narrow and specific: how rope is actually tied, and how it hurts
-- people. Against that, `Practices & Play` holds Rope Bat, Rope Eel, Rope
-- Gremlin, Rope Kitten, Rope Menace, Rope Monkey, Rope Princess, Rope Slut,
-- Rope Dummy, Rope Toy and Rope Coven — persona coinages, most with a usage
-- count of zero — while a reader could not look up a single column tie, a hip
-- harness, a partial suspension or nerve compression. The corpus over-indexed
-- on identity words and under-indexed on the things that leave marks.
--
-- THE DEDUPE RAN FIRST and it removed most of the Japanese vocabulary, because
-- the concepts are already here under English names:
--
--   takatekote  IS `box-tie`, which exists with a good body that already names
--   / gote      "takate kote" and the radial nerve. An alias, not a row.
--   shinju      already an alias of the active `breast-bondage`.
--   kinbaku     already an alias of the active `shibari`.
--   matanawa    IS `crotch-rope`, active. An alias.
--   hishi       IS the diamond pattern of `karada`, whose body already says
--               "repeating diamonds down the front of the torso". An alias.
--   nawashi     IS `rigger`, active. An alias.
--   hogtie, strappado, spread eagle, frogtie, ball tie, reverse prayer,
--   karada, box tie, crotch rope   all created by 20290201100000. Nothing here
--               duplicates them; this file is the layer that pass did not cover.
--
--   The ~200 further Japanese tie names on the rebornropes index (aomuke zuri,
--   hikyaku zuri, kagerou shibari, teppou shibari …) are DELIBERATELY NOT
--   created. They are named figures within one tradition, not glossary
--   concepts a reader of this site arrives looking for, and minting 200 rows
--   with one sentence each is how the "rope <animal>" cohort happened in the
--   first place. Recorded so the next comparison does not re-propose them.
--
-- THREE ASYMMETRIES the comparison exposed, each fixed here:
--   kitten-play  Pony Play and Puppy Play are both active; kitten play is the
--                third of the three commonest animal roles and had no row.
--   day-collar   `Collaring` is active; the everyday-wear collar had no row,
--                though it is the collar most people actually own.
--   topspace     `Subspace` and `Domspace` are both active; the top-side
--                headspace that is not specifically a dominant's had no row.
--
-- SAFETY FACTS ARE SPECIFIC OR ABSENT — the rule 20290201100000 set. Where a
-- tie or a term carries a real, named risk it is stated concretely: which
-- nerve, what the symptom is, what you do about it. Where there is no
-- distinctive risk nothing is padded in, and no row carries consent
-- boilerplate, which TAG_STYLE_SYSTEM bans.
--
-- PUBLISHED, because every definition is hand-written for this migration. That
-- needs all four of prose present (or enforce_tag_thin_page_gate stamps
-- 'thin'), human_reviewed (or enforce_tag_seo_sensitivity_gate forces
-- seo_indexable=false on an adult row), verification_status='reviewed' (or
-- unified_tags_public_gated_read hides a sensitive row from anon), and
-- seo_indexable. is_adult is NEVER written by hand — it derives from the
-- junction, which is why the junction is written EXPLICITLY below.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:rope-technique-vocabulary', true);

do $mig$
declare
  r       record;
  v_bad   int;
  v_cat   uuid;
  v_made  int := 0;
  v_alias int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, descr, longd) values
    ('single-column-tie', 'Single Column Tie', 'practices-play',
     'The foundational rope tie: a cuff around one limb that holds tension without tightening on it.',
     'A single column tie binds one "column" — a wrist, an ankle, a thigh — in a cuff that can be pulled on without closing. It is the first tie almost everyone learns, and most other ties are built from it.

The whole point is that it does not cinch. A wrap that tightens under load becomes a tourniquet on a limb that is holding weight or being pulled, which is why the tie has a structural lock rather than relying on friction. Two fingers should slide under the wraps after it is tied, and that is checked again once tension goes on, not only when it is finished.'),

    ('double-column-tie', 'Double Column Tie', 'practices-play',
     'A cuff binding two limbs together — wrists to each other, or an ankle to a thigh.',
     'A double column tie binds two columns side by side, most often wrist to wrist or ankle to thigh, with a cinch passed between them so the wraps cannot slide together and crush what is in between.

The cinch is the load-bearing part. Without it the two wraps close on each other and the limbs are squeezed rather than held, which is the usual way a beginner''s wrist tie ends in numb hands. As with a single column, circulation is checked after tension is applied, not before.'),

    ('futomomo', 'Futomomo', 'practices-play',
     'A leg tie folding the calf against the thigh and binding them together, from the Japanese for "thigh".',
     'A futomomo folds a leg at the knee and lashes the calf to the thigh, usually with several wraps and a cinch between the limbs. It fixes the leg in a bent position, which is what makes it the standard leg component in suspension: it gives a solid, load-bearing anchor on the lower body.

It is a compressive tie on a limb, so it interrupts circulation faster than a tie on the torso. Wraps go above and below the knee rather than across it, well clear of the outside of the knee where the peroneal nerve runs close to the surface — compression there causes foot drop. A cold or numb foot is a reason to untie, not to wait.'),

    ('kikkou', 'Kikkou', 'practices-play',
     'The tortoise-shell harness — repeating hexagons worked across the torso.',
     'Kikkou means "tortoise shell", and the tie is a lattice of hexagons built down the body from a series of half-hitches. It is largely decorative, sitting closer to a karada than to a load-bearing harness, and it is one of the patterns most associated with Japanese rope in photographs.

Worked as decoration it restrains little and carries little risk. Used as an anchor for anything else it becomes structural, and the wraps were not placed with load in mind — which is the point at which it needs the same checks as a chest harness rather than the ones a decorative tie needs.'),

    ('chest-harness', 'Chest Harness', 'practices-play',
     'Rope worked around the torso above and below the chest, with or without the arms bound into it.',
     'A chest harness is the band of rope that carries the upper body: wraps above and below the chest, tensioned and locked so they hold together as one structure. A box tie is a chest harness with the arms bound into it; plenty of harnesses leave the arms free.

It is the component most suspension is hung from, and the one most associated with injury, because the wraps pass through the armpit where the brachial plexus and the radial nerve run. Tingling, numbness, a weakening grip or a wrist that will not lift are nerve symptoms, not discomfort: the rope comes off then, not at the end. Wraps that sit too high also restrict breathing, which matters more the longer the tie is held.'),

    ('hip-harness', 'Hip Harness', 'practices-play',
     'A rope harness around the hips and upper thighs, used to carry the lower body''s weight.',
     'A hip harness distributes load across the pelvis rather than a single limb, which makes it the usual way a bottom is held upright or seated in the air. Because the pelvis is solid bone and can take weight over a wide area, it is generally more comfortable to hang from for a long period than a chest harness.

The wraps still need placing. Rope that rides up onto the waist puts load on soft tissue and the lower ribs instead of the pelvis, and rope that sits in the crease of the hip can press on the nerve running down the front of the thigh, which shows up as numbness or burning across the outer thigh.'),

    ('partial-suspension', 'Partial Suspension', 'practices-play',
     'Taking some of a bound person''s weight onto the rope while a point of contact stays on the ground.',
     'Partial suspension lifts part of the body — a shoulder, a hip, one leg — while a foot, a knee or the other hip stays down. It is where most people learn to work with load, because the ground is still carrying a share of the weight and the bottom can usually take some of it back.

It is not a soft version of full suspension. Load concentrates in the same places and the same nerves are involved, and a partial can put MORE strain on a single limb than a full suspension does, because the weight is split between two points rather than spread across a harness. The hard point, the line and the connectors carry the same real forces either way.'),

    ('semenawa', 'Semenawa', 'practices-play',
     'Japanese "torment rope" — tying where the discomfort is the content of the scene, not a side effect.',
     'Semenawa is rope tied to be hard to endure. The positions are stressful by design, the tie is held past the point of comfort, and what the bottom is working with is strain, exhaustion and the passage of time rather than sensation or decoration. It is the counterpart to aibunawa, "caressing rope", which is tied toward tenderness.

It asks for more communication than gentler rope, not less, because the signals a top would normally read as "stop" — shaking, laboured breathing, going quiet — are the expected state. What separates it from injury is that the limits were set before it started and the top is tracking circulation, breathing and nerve symptoms independently of how much the bottom is visibly struggling.'),

    ('newaza', 'Newaza', 'practices-play',
     'Rope tied on the ground rather than in the air — floor work.',
     'Newaza, borrowed from the judo term for ground technique, is rope done with the bottom on the floor: seated, kneeling, prone or lying. It is the larger part of most people''s rope practice and not a stage on the way to suspension.

Nothing is load-bearing, so the failure modes are different: instead of a harness dropping, the risks are a limb left compressed too long under the body''s own weight, and positions that restrict breathing when the chest is against the floor. Time is the variable that matters most, and a position that is fine for five minutes is often not fine for thirty.'),

    ('nerve-compression', 'Nerve Compression', 'practices-play',
     'Rope pressing on a nerve — the most common serious injury in bondage, and the one with a clear warning sign.',
     'Nerve compression happens when a wrap sits over a nerve where it runs close to the surface and pressure interrupts it. In rope it is most often the radial nerve in the upper arm, compressed by a chest harness or box tie; the result is wrist drop, where the hand cannot be lifted at the wrist. Other common sites are the peroneal nerve at the outside of the knee, which produces foot drop, and the ulnar nerve at the elbow.

The warning sign is not pain. It is tingling, numbness, pins and needles, a hand that feels "asleep", or loss of grip strength — and unlike circulation problems, nerve symptoms do not announce themselves by hurting. That is why the response is immediate release rather than adjustment or finishing the scene. Recovery usually takes days to weeks; it can take months, and it is occasionally permanent.

Colour, temperature and capillary refill tell you about circulation. They tell you nothing about nerves, so both are checked, and the bottom is asked directly rather than watched.'),

    ('rope-marks', 'Rope Marks', 'practices-play',
     'The impressions rope leaves on skin — usually harmless, occasionally a sign something went wrong.',
     'Rope marks are the lines and indentations left where wraps pressed into skin. Most fade within hours and many people want them; they are not in themselves evidence of anything being tied badly, and they say more about skin and how long the tie was held than about technique.

What is worth reading is the ones that do not behave. Marks that are still raised or discoloured after a day, bruising in a line where there was no impact, broken skin, or numbness in the area are different: those point to wraps that were too tight or too narrow, or to a nerve that took pressure. Marks are also not private — they are visible in changing rooms, at work and in swimwear, which is worth negotiating before rather than discovering after.'),

    ('safety-shears', 'Safety Shears', 'gear-aesthetics',
     'Blunt-tipped shears kept within reach of anyone tying, for cutting rope off fast.',
     'Safety shears — the blunt-nosed trauma shears ambulance crews carry — cut webbing and rope with the flat lower blade sliding along the skin, so they can be run under a tight wrap without stabbing whoever is in it. That is what makes them the tool rather than a knife: the situations where rope has to come off immediately are exactly the situations where nobody has a steady hand.

They stay within arm''s reach of the person tying, not in a bag across the room, and they are part of the kit for floor work as much as for suspension. Cheap shears blunt quickly and jam on natural fibre, which is worth knowing before the moment they are needed. Cutting good rope is the correct decision when a nerve is involved; the rope is replaceable.'),

    ('jute', 'Jute', 'gear-aesthetics',
     'A natural plant fibre, with hemp the standard rope for Japanese-style bondage.',
     'Jute is one of the two natural fibres rope bondage is usually tied with. It is lighter than hemp, holds friction well, and has the dry, slightly hairy handle that most Japanese-style rope work is built around — friction ties depend on rope gripping rope, and synthetic rope slips where jute holds.

It arrives stiff and is conditioned before use: washed, dried under tension, singed and oiled. It is weaker than synthetic rope and it ages, so suspension line is retired on condition rather than kept indefinitely, and rope that has taken a shock load is retired whether or not it looks damaged. Asanawa is the Japanese term covering these plant-fibre ropes generally.'),

    ('kitten-play', 'Kitten Play', 'bdsm-power-exchange',
     'Animal roleplay built on cat behaviour — aloof, affectionate on its own terms, and not especially obedient.',
     'Kitten play is pet play with a cat''s temperament rather than a dog''s. Where pup play tends toward pack energy, eagerness and training, kitten play runs on independence: attention given when the kitten decides, not on command, and a dynamic where a handler earns contact rather than directing it.

The gear is usually ears, a tail and a collar, and the headspace is the substance rather than the kit. Like other animal roles it is often non-sexual, and it is frequently practised in public-facing community spaces where the sexual side is explicitly left out.'),

    ('day-collar', 'Day Collar', 'gear-aesthetics',
     'A collar made to be worn in ordinary life — usually a piece of jewellery that reads as nothing in particular.',
     'A day collar carries the meaning of a collar in a form that passes unremarked at work or at a family dinner: a chain, a locking bracelet, a plain band, a pendant. It is the collar most people who wear one actually own, because the visible kind is not wearable in most of a life.

It does the same thing a formal collar does — marks a commitment, an ownership, or a dynamic — and it is usually the object that gets the ceremony. What changes is who can read it, which is often the point: a legible signal inside the relationship and an invisible one outside it, for people who are not out about their kink, their partner, or both.'),

    ('topspace', 'Topspace', 'bdsm-power-exchange',
     'The absorbed, tunnel-vision headspace a top can drop into while running a scene.',
     'Topspace is the top-side counterpart to subspace: a narrowed, highly focused state where attention collapses onto the scene and time stops tracking normally. It can feel like flow, and it makes people good at what they are doing — right up until it stops making them good at noticing anything outside it.

That is the reason it is worth naming. A top deep in it can miss a bottom''s colour change, a wrap gone tight, or a safeword said quietly, which is part of why spotters and planned check-ins exist. It has a comedown too — top drop — and it is the half of aftercare that most often gets skipped, because the person in it is usually the one organising everyone else''s.');

  -- Every category must resolve, or a row lands uncategorised and
  -- tag_hygiene_stats counts it with nothing to explain why.
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'rope vocab: % row(s) name a category that does not exist', v_bad;
  end if;

  -- An ACTIVE or MERGED slug aborts: a live tag must never be silently
  -- overwritten by an import, and a merged one is a redirect whose target this
  -- migration knows nothing about.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.status <> 'deprecated';
  if v_bad > 0 then
    raise exception 'rope vocab: % slug(s) already exist and are not deprecated', v_bad;
  end if;

  -- trg_tag_reject_alias_shadow raises if a slug is held as an alias of some
  -- other tag. Say so here rather than failing mid-loop.
  select count(*) into v_bad from _new n
   where exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug);
  if v_bad > 0 then
    raise exception 'rope vocab: % slug(s) are held as an alias of another tag', v_bad;
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

    -- The junction must be written EXPLICITLY on insert.
    -- sync_tag_category_assignment_after is scoped `AFTER UPDATE OF
    -- category_id`, so it does not fire for a new row: an INSERT sets
    -- category_id and the text mirror and files NOTHING in
    -- tag_category_assignments. Because unified_tags_recompute_is_adult() is a
    -- trigger on that junction table, the row would then derive is_adult=false
    -- — and 20290201100000 measured exactly that on `box-tie`, which would have
    -- published rope-bondage pages with no age gate at all.
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat, true from public.unified_tags t where t.slug = r.slug
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written by hand for migration 50200101100700 (rope technique vocabulary).',
           false
      from public.unified_tags t
     where t.slug = r.slug
       and not exists (select 1 from public.tag_sources s
                        where s.tag_id = t.id and s.claim_summary like '%rope technique vocabulary%');
  end loop;

  ----------------------------------------------------------- revive `hardpoint`
  -- Deprecated, with `description` = the literal string "Toys tag",
  -- short_description = "Hardpoint" and long_description = "Hardpoint" — a row
  -- that defines the term with the term. It is the single most load-bearing
  -- object in suspension and it gets a real body rather than a second row.
  update public.unified_tags t set
    name                = 'Hard Point',
    description         = 'The rigged anchor a suspension hangs from, and the one component whose failure has no second chance.',
    short_description   = 'The overhead anchor a suspension hangs from — rigged and load-rated, never improvised.',
    long_description    =
      'A hard point is the fixed overhead anchor rope is suspended from: a beam, a plate bolted through structure, a rated ring on a frame. It is the component with no redundancy — everything else in a suspension can be backed up, and the anchor cannot.

The load it takes is not the bottom''s body weight. A person who is lifted, lowered, spun or who drops even slightly generates forces several times their static weight, and the rating that matters is a dynamic one. What holds it matters more than what it is: a ceiling joist found by knocking, a hook screwed into plasterboard, or an eye bolt in end-grain are the usual ways this goes wrong, and none of them looks different from a sound one until it is loaded.

Rigging over a bed or a mat does not make an unrated point safe; it changes how far someone falls, not whether they fall.',
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    category_id         = (select id from public.tag_categories where slug = 'gear-aesthetics'),
    seo_indexable       = true,
    human_reviewed      = true,
    verification_status = 'reviewed',
    last_verified_at    = now()
  where t.slug = 'hardpoint'
    and t.description = 'Toys tag';
  get diagnostics v_bad = row_count;
  if v_bad = 1 then
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, (select id from public.tag_categories where slug = 'gear-aesthetics'), true
      from public.unified_tags t where t.slug = 'hardpoint'
    on conflict (tag_id, category_id) do update set is_primary = true;
  end if;

  ------------------------------------------------------------------- aliases
  -- Japanese names for concepts the glossary already holds under an English
  -- name. `approved` rather than `auto` because each was checked by hand, and
  -- since 20261012090000 display, auto-tagging and the search bridge are ALL
  -- approved-only — an `auto` alias here would be inert and route nothing.
  --
  -- `synonym`, not `multilingual`, and that is the same call 20261012090100
  -- made for `Shabu`: these are not translations of an English term, they are
  -- the names the practice uses. English-speaking rope practitioners say
  -- takatekote and futomomo; "box tie" is the translation, not the original.
  -- `asanawa` is `covers` rather than `synonym` because it is the broader
  -- Japanese term for plant-fibre rope generally, covering both jute and hemp.
  --
  -- alias_slug is globally UNIQUE and trg_tag_reject_alias_shadow refuses an
  -- alias that shadows an existing tag NAME, so every one of these was checked
  -- against both before being written.
  for r in
    select * from (values
      ('Takatekote',  'takatekote',  'box-tie',     'synonym'),
      ('Takate Kote', 'takate-kote', 'box-tie',     'synonym'),
      ('Gote',        'gote',        'box-tie',     'synonym'),
      ('Matanawa',    'matanawa',    'crotch-rope', 'synonym'),
      ('Hishi',       'hishi',       'karada',      'synonym'),
      ('Nawashi',     'nawashi',     'rigger',      'synonym'),
      ('Asanawa',     'asanawa',     'jute',        'covers'),
      ('Futo',        'futo',        'futomomo',    'synonym'),
      ('Tsuri',       'tsuri',       'suspension',  'synonym'),
      ('Floor Work',  'floor-work',  'newaza',      'synonym'),
      ('Yuka Shibari','yuka-shibari','newaza',      'synonym')
    ) as v(alias_name, alias_slug, canon_slug, alias_type)
  loop
    -- Skip rather than fail if the canonical is not active: this file must not
    -- mint an alias pointing at a row a later change deprecated.
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select t.id, r.alias_name, r.alias_slug, r.alias_type, 'approved'
      from public.unified_tags t
     where t.slug = r.canon_slug and t.status = 'active'
       and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.alias_slug)
       and not exists (select 1 from public.unified_tags u
                        where public.dedup_despace(u.name) = public.dedup_despace(r.alias_name));
    get diagnostics v_bad = row_count;
    v_alias := v_alias + v_bad;
  end loop;

  raise notice 'rope technique vocabulary: % created, % aliases added', v_made, v_alias;

  ------------------------------------------------------------ postconditions
  if v_made <> 16 then
    raise exception 'rope vocab: expected 16 rows, made %', v_made;
  end if;

  -- Every new row must be active, published, and carry a primary junction.
  select count(*) into v_bad
    from _new n join public.unified_tags t on t.slug = n.slug
   where t.status <> 'active'
      or t.seo_indexable is not true
      or t.human_reviewed is not true
      or t.verification_status <> 'reviewed'
      or not exists (select 1 from public.tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary);
  if v_bad > 0 then
    raise exception 'rope vocab: % row(s) did not publish cleanly', v_bad;
  end if;

  -- The age gate is DERIVED from the junction, so assert it rather than assume
  -- it. unified_tags_recompute_is_adult() flags Practices & Play, Dynamics &
  -- Roles AND Gear, so all sixteen rows must come out adult — a row coming out
  -- adult=false means its junction did not land, which is exactly the failure
  -- 20290201100000 measured on `box-tie` and which would publish rope-bondage
  -- pages with no age gate at all.
  select count(*) into v_bad
    from _new n join public.unified_tags t on t.slug = n.slug
   where t.is_adult is not true;
  if v_bad > 0 then
    raise exception 'rope vocab: % row(s) published without the age gate', v_bad;
  end if;

  -- `hardpoint` must no longer define itself with itself.
  select count(*) into v_bad from public.unified_tags
   where slug = 'hardpoint' and (description = 'Toys tag' or long_description = 'Hardpoint');
  if v_bad > 0 then
    raise exception 'rope vocab: hardpoint still carries its placeholder prose';
  end if;
end
$mig$;
