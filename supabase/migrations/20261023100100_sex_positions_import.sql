-- Sex positions → the Positions stop.
--
-- SOURCE: gaysexpositions.guide (140 entries across its anal / oral / group
-- sections), plus four names from the triple j "Sunday Hook Up" list that the
-- first source spells differently. Descriptions are ORIGINAL PROSE written
-- from the extracted structured facts (each source page exposes Giver/Receiver
-- Activity + Pose, or an explicit A-does-X-to-B mapping for the group set).
-- No source sentence is reproduced.
--
-- FOUR THINGS IN HERE ARE NOT MECHANICAL AND SHOULD BE READ BEFORE EDITING:
--
-- 1. INSERT DOES NOT FILE A TAG. Measured on prod in a rolled-back txn:
--    inserting with category_id alone yields `category` NULL, ZERO junction
--    rows, and therefore is_adult=false + seo_indexable=true — i.e. un-gated,
--    indexable adult content. trg_sync_tag_category is BEFORE **UPDATE** and
--    trg_sync_tag_category_after is AFTER **UPDATE OF category_id**; neither
--    fires on INSERT. So each tag needs the category TEXT written explicitly
--    and its junction row inserted explicitly. The junction insert is what
--    makes unified_tags_recompute_is_adult() run, which in turn trips the
--    seo gate. Verified end state: is_adult=true, seo_indexable=false.
--
-- 2. THE SOURCE'S "ASIAN <X>" NAMES ARE RE-NAMED TO "SQUATTING <X>".
--    On that site the prefix denotes a flat-footed squat, not a person: the
--    structured data for asian-cowboy differs from cowboy in exactly one
--    field, Receiver Pose sitting-vs-kneeling, and asian-jockey/asian-lap-dance
--    are likewise the feet-planted squat form. Publishing "Asian Cowboy" as
--    glossary vocabulary on this platform would read as a racial category of
--    person. The source spelling is kept as an UNAPPROVED alias: findable in
--    admin and search, never displayed (display is approved-only) and never an
--    auto-tagging rule (run_tag_assignment_reconcile trusts approved aliases).
--
-- 3. THREE NAMES COLLIDE WITH LIVE TAGS THAT MEAN SOMETHING ELSE —
--    Butterfly (Slang: a flirty gay man), Bully (Dynamics & Roles) and
--    Bodyguard (Identity). unified_tags has no unique index on name, and
--    run_tag_assignment_reconcile builds its lookup from lower(name) with
--    tag_id only as a TIEBREAKER — two active tags sharing a name is the
--    defect that already broke 21 keys there. These three are disambiguated.
--
-- 4. wikidata_id IS DELIBERATELY NULL ON ALL OF THEM. These names — Arch,
--    Crab, Lotus, Superman, Warrior, Screw, Jockey, Butterfly — are exactly
--    the namesake bait that put Cassia fistula on `golden-shower` and Q4
--    (death) on `passing`. tag_medical_codes_sync and tag_wikidata_hierarchy
--    rebuild weekly FROM that identifier, so a plausible-but-wrong QID
--    regenerates wrong data forever while a null one regenerates nothing.

select set_config('app.actor', 'migration:sex-positions-import', false);

do $$
declare
  v_cat   uuid;
  v_name  text;
  v_added int;
begin
  select id, name into v_cat, v_name from tag_categories where slug = 'sex-positions';
  if v_cat is null then
    raise exception 'Positions stop is missing — 20261023100000 must run first';
  end if;

  -- ── 1. the tags ───────────────────────────────────────────────────────────
  insert into unified_tags (name, slug, description, category_id, category,
                            entity_kind, status, wikidata_id)
  select v.name, v.slug, v.descr, v_cat, v_name, 'concept', 'active', null
  from (values
    -- ANAL / PENETRATIVE ────────────────────────────────────────────────────
    ('afternoon-delight','Afternoon Delight','The bottom sits at the edge of a surface with the hips just past it and the arms braced behind while the top stands facing them and lifts their legs. Works at desk or table height.'),
    ('arch','Arch','The bottom lies on their back and pushes their hips upward into a bridge while the top kneels between their legs. The raised hips do the work of an angle the top would otherwise have to hold.'),
    ('basset-hound','Basset Hound','A low rear-entry position: the bottom on all fours with the chest dropped toward the surface, the top kneeling close behind.'),
    ('bend-over','Bend Over','The bottom bends forward onto their hands while the top stands behind. The standing equivalent of doggy style, and the usual position when no surface is available.'),
    ('bent-spoons','Bent Spoons','Both partners lie stacked front-to-back with the knees drawn up toward the chest, the top underneath with the hips bridged and entering from below. The tucked knees open the angle that flat spooning closes.'),
    ('bodyguard-position','Bodyguard (Position)','Both partners stand, the top close behind the bottom and entering from the rear. Named for the upright, chest-to-back stance. Disambiguated from the Identity tag of the same name.'),
    ('elevated-bodyguard','Elevated Bodyguard','The bodyguard stance with the bottom kneeling rather than standing, so the top remains upright behind them.'),
    ('booster-seat','Booster Seat','The bottom sits while the top stands to penetrate, the seated height doing the work of matching the two bodies.'),
    ('bulldog','Bulldog','The bottom on all fours with the top squatting over them on the feet rather than kneeling. Crouching rather than kneeling makes the angle steeper than doggy style.'),
    ('reverse-bulldog','Reverse Bulldog','The bottom on all fours with the top squatting over them facing away, hands braced on the floor or their own knees.'),
    ('bully-position','Bully (Position)','The bottom kneels while the top stands behind and hooks their arms under the bottom''s arms in a full-nelson hold. Disambiguated from the Dynamics & Roles tag of the same name.'),
    ('bumper-cars','Bumper Cars','Both partners lie face down with their heads in opposite directions, the top lying along the bottom''s back and entering from the rear.'),
    ('butterfly-position','Butterfly (Position)','The bottom on their back with their legs wrapped around the top, who kneels upright between them. Disambiguated from the Slang tag of the same name.'),
    ('cannonball','Cannonball','The bottom sits at the edge of a surface with the knees tucked tight to the chest, body folded, while the top stands to penetrate.'),
    ('sitting-cannonball','Sitting Cannonball','The tucked cannonball shape with the top seated and the bottom sitting astride their lap, knees still drawn to the chest.'),
    ('cowboy','Cowboy','The top lies on their back while the bottom kneels astride them and controls the pace. The bottom faces the top and does the moving.'),
    ('squatting-cowboy','Squatting Cowboy','Cowboy with the bottom squatting on flat feet rather than kneeling, which shortens the stroke and hands the bottom more control over depth.'),
    ('reverse-cowboy','Reverse Cowboy','Cowboy with the bottom facing away from the top, still kneeling astride and setting the pace.'),
    ('reverse-squatting-cowboy','Reverse Squatting Cowboy','The squatting form of cowboy with the bottom facing away — flat feet, and the bottom controlling depth.'),
    ('reverse-standing-cowboy','Reverse Standing Cowboy','The top lies down while the bottom stands astride facing away, lowering into a squat to control the movement.'),
    ('sideways-cowboy','Sideways Cowboy','The bottom straddles the top''s hips sideways rather than facing toward or away, changing the angle of entry.'),
    ('cowboy-splits','Cowboy Splits','Cowboy with the bottom''s legs spread wide to the sides while sitting astride the top''s hips.'),
    ('standing-cowboy','Standing Cowboy','The top lies down while the bottom squats over their hips with both feet planted on the surface.'),
    ('crab','Crab','The top lies on their back while the bottom moves above them on hands and feet, face up, hips lifted clear of the surface.'),
    ('danseur','Danseur','Both partners stand face to face with one of the bottom''s legs raised high and held. Named for the ballet lift it resembles.'),
    ('deep-impact','Deep Impact','The bottom lies back with the legs raised high while the top stands at the edge of the surface and enters downward.'),
    ('deep-stick','Deep Stick','The bottom on their back with the legs raised or resting on the top''s shoulders, the top kneeling between them.'),
    ('elevated-doggy-style','Elevated Doggy Style','Doggy style with the bottom on all fours on a raised surface so the top can stand behind rather than kneel.'),
    ('sideways-doggy-style','Sideways Doggy Style','The bottom on all fours with the chest lowered while the top enters at an angle from the side.'),
    ('standing-doggy-style','Standing Doggy Style','Both partners standing, the bottom bent forward at the hips and the top behind. Doggy style without a surface to kneel on.'),
    ('elevated-splits','Elevated Splits','The bottom sits at the edge of a raised surface with the legs spread wide while the top stands to penetrate.'),
    ('fire-hydrant','Fire Hydrant','The bottom on all fours lifts one leg out to the side while the top kneels behind. The raised leg opens the angle.'),
    ('folded-deck-chair','Folded Deck Chair','The bottom on their back with the knees folded toward the chest while the top holds a plank above them and enters downward.'),
    ('fusion','Fusion','The top sits leaning back on their hands while the bottom moves above them on all fours, facing away.'),
    ('jockey','Jockey','The bottom lies face down with the legs together while the top straddles their thighs on all fours, facing the bottom''s head.'),
    ('squatting-jockey','Squatting Jockey','The jockey straddle with the top squatting on flat feet over the bottom''s thighs rather than kneeling.'),
    ('kneeling-jockey','Kneeling Jockey','The jockey straddle with the top kneeling astride the bottom''s thighs.'),
    ('standing-jockey','Standing Jockey','The bottom lies face down on a raised surface with the hips at the edge while the top stands astride their thighs.'),
    ('lap-dance','Lap Dance','The top sits on a chair while the bottom lowers onto their lap facing away, the bottom setting the pace.'),
    ('squatting-lap-dance','Squatting Lap Dance','The lap dance with the bottom squatting on flat feet over the seated top''s lap.'),
    ('floor-lap-dance','Floor Lap Dance','The top sits on the floor with the legs extended while the bottom squats over their lap.'),
    ('launch-pad','Launch Pad','The bottom lies back with the knees drawn in and the feet braced against the top''s chest while the top kneels upright. The feet act as a brake on depth.'),
    ('leg-glider','Leg Glider','The bottom lies on their back with one leg raised straight up and the other flat, the top kneeling upright alongside.'),
    ('standing-leg-glider','Standing Leg Glider','The bottom lies face down with the torso on a raised surface and the lower legs lifted while the top stands astride one leg.'),
    ('lotus','Lotus','The top sits cross-legged while the bottom sits astride facing them with the legs crossed behind the top''s back. A close, slow, face-to-face position with little room to move.'),
    ('mastery','Mastery','The top sits upright and stays still while the bottom squats astride their lap on flat feet and does the moving.'),
    ('kneeling-mastery','Kneeling Mastery','The seated-top position with the bottom kneeling astride the lap so the thighs carry the weight.'),
    ('standing-mastery','Standing Mastery','The seated-top position with the bottom in a standing half-squat over the lap.'),
    ('mirror-of-pleasure','Mirror of Pleasure','The bottom lies on their back with both legs together resting on one of the top''s shoulders while the top kneels upright. The closed legs tighten the fit.'),
    ('missionary','Missionary','The bottom on their back with the legs spread and the top face down on top of them. The most common face-to-face position, and the one with the most eye contact.'),
    ('inverse-missionary','Inverse Missionary','The top lies on their back and stays still while the bottom moves above them on all fours, chest toward the top.'),
    ('mutual-penetration','Mutual Penetration','One partner lies back with the knees drawn up while the other squats astride, each penetrating the other at the same time.'),
    ('pearly-gates','Pearly Gates','Both partners lie stacked with the hips raised into a bridge, the partner underneath doing the penetrating.'),
    ('pile-driver','Pile Driver','The bottom is inverted on the upper back and neck with the hips up and the legs folded overhead while the top squats above and enters downward. A steep angle that few people hold for long.'),
    ('reverse-pile-driver','Reverse Pile Driver','The pile driver with the top turned a hundred and eighty degrees to face away.'),
    ('sideways-pile-driver','Sideways Pile Driver','The pile driver with the top squatting across the bottom rather than in line with them.'),
    ('pirates-bounty','Pirate''s Bounty','The bottom lies on their back with one leg raised straight while the top kneels upright between their legs.'),
    ('elevated-pirates-bounty','Elevated Pirate''s Bounty','The same single-raised-leg shape with the bottom on a raised surface and the top standing at the edge.'),
    ('prison-guard','Prison Guard','The bottom stands facing away, bent forward, with the arms raised behind the back for the top to hold while entering from behind.'),
    ('pyramid','Pyramid','The bottom lies below with the knees drawn up while the top stands or squats over them to penetrate downward.'),
    ('rear-entry','Rear Entry','The bottom lies face down propped on the forearms while the top holds themselves above on all fours. Flatter than doggy style, with the whole body in contact.'),
    ('sideways-rear-entry','Sideways Rear Entry','Rear entry with the top angled across the bottom rather than in line with them.'),
    ('reverse-bronco','Reverse Bronco','The top lies face down with the erection pinned back along the perineum while the bottom squats down onto it facing the top''s feet. One of the hardest positions on the source list.'),
    ('reverse-wheelbarrow','Reverse Wheelbarrow','The bottom is inverted into a headstand while the top stands behind and holds their thighs for support.'),
    ('scissors','Scissors','The bottom lies on their back while the top lies perpendicular on one side, hips under the bottom''s raised knee and straddling the other leg.'),
    ('screw','Screw','The bottom lies with the hips twisted to one side while the top kneels upright alongside. The twist is what changes the angle.'),
    ('seesaw','Seesaw','The top sits with the legs extended and stays passive while the bottom squats astride and supplies all of the movement.'),
    ('side-by-side','Side by Side','Both partners lie on their sides facing each other, the bottom''s knees drawn toward the chest and the top resting over the lower leg.'),
    ('sitting-bull','Sitting Bull','The top sits with the legs extended while the bottom lies on their back in front with the knees pulled up and apart.'),
    ('soaring-eagle','Soaring Eagle','The bottom is inverted on the shoulders with the legs folded back overhead while the top holds a plank above and enters downward.'),
    ('reverse-soaring-eagle','Reverse Soaring Eagle','A listed variant of soaring eagle. The source publishes identical body data for both and does not state what the reverse inverts, so the difference is not recorded here rather than guessed.'),
    ('spoons','Spoons','Both partners lie on their sides stacked front-to-back, the top entering from behind. The least effortful penetrative position and the easiest to hold for a long time.'),
    ('superman','Superman','The bottom is face down and clear of the surface, gripping something ahead or resting on the forearms, with the legs wrapped around the standing top''s thighs. One of the hardest positions on the source list.'),
    ('suspended-congress','Suspended Congress','The top stands braced against a wall and carries the bottom on joined hands while the bottom grips their shoulders and pushes against the wall with the feet.'),
    ('t-square','T-Square','The bottom lies on their back with the knees up and apart while the top lies on one side, perpendicular, hips beneath the arch of the bottom''s legs.'),
    ('teaspoons','Teaspoons','Both partners kneel upright and stacked front-to-back with the backs arched, the top entering from behind. Spoons done kneeling.'),
    ('warrior','Warrior','The top lies on their back with the knees drawn toward the chest and stays passive while the bottom squats down onto them, facing them.'),
    ('reverse-warrior','Reverse Warrior','The warrior position with the bottom facing away from the top.'),
    ('reverse-kneeling-warrior','Reverse Kneeling Warrior','The top on their back with the legs spread and the knees toward the chest while the bottom kneels facing away and controls entry.'),
    ('prone-boning','Prone Boning','The bottom lies flat and face down with the legs together while the top lies along their back. The flattest rear-entry shape, and the one with the shallowest angle.'),

    -- ORAL ──────────────────────────────────────────────────────────────────
    ('kneeling-69','Kneeling 69','A 69 with one partner upright on the knees and the other inverted head-down and supported, both giving oral at once.'),
    ('sideways-69','Sideways 69','A 69 with both partners on their sides head-to-foot, so neither carries the other''s weight. The easiest 69 to hold.'),
    ('sitting-69','Sitting 69','A 69 with one partner seated upright and the other inverted head-down at their lap, legs vertical.'),
    ('standing-69','Standing 69','A 69 with one partner standing and holding the other upside down against their body. The most demanding form of the position.'),
    ('aerial-blowjob','Aerial Blowjob','The receiver is held clear of the ground while the giver supports their weight and takes them orally from below.'),
    ('bent-supine-blowjob','Bent Supine Blowjob','The receiver lies on their back with the knees drawn to the chest and the hips rolled up, the giver working from above.'),
    ('bowing-blowjob','Bowing Blowjob','The receiver stands and hinges forward at the hips with a flat back while the giver takes them from the front.'),
    ('buck-blowjob','Buck Blowjob','The receiver holds a plank on the hands and toes with one leg raised while the giver works from underneath.'),
    ('crab-blowjob','Crab Blowjob','The receiver is face up on the hands and feet with the torso lifted clear of the floor and the giver beneath the hips.'),
    ('doggy-blowjob','Doggy Blowjob','The receiver on hands and knees with the giver in front of or beneath the hips.'),
    ('floor-sitting-blowjob','Floor Sitting Blowjob','The receiver sits upright on the floor with the legs extended and the giver between them.'),
    ('headstand-blowjob','Headstand Blowjob','The receiver is inverted with the weight on the hands and forearms and the legs overhead while the giver stands at their hips.'),
    ('kneeling-blowjob','Kneeling Blowjob','The receiver kneels upright with the hips pushed forward and the giver low in front of them.'),
    ('lateral-blowjob','Lateral Blowjob','The receiver lies with the shoulders back and the hips rotated to one side while the giver works alongside.'),
    ('prone-blowjob','Prone Blowjob','The receiver lies face down propped on the forearms with the chest raised and the giver beneath the hips.'),
    ('reverse-buck-blowjob','Reverse Buck Blowjob','The receiver is on all fours facing upward with the torso raised and the giver underneath.'),
    ('shoulderstand-blowjob','Shoulderstand Blowjob','The receiver rests on the shoulders with the hips inverted over the head and the legs beyond, the giver working downward from above.'),
    ('sitting-blowjob','Sitting Blowjob','The receiver sits on a chair or the edge of a surface with the feet down and the giver kneeling between their legs.'),
    ('squatting-blowjob','Squatting Blowjob','The giver lies on their back with the head off the edge of the surface while the receiver squats over their face.'),
    ('standing-blowjob','Standing Blowjob','The receiver stands upright while the giver kneels in front. The most common oral position and the one that needs no furniture.'),
    ('supine-blowjob','Supine Blowjob','The receiver lies flat on their back with the legs extended and the giver between or beside them.'),
    ('aerial-rimjob','Aerial Rimjob','The receiver is held clear of the ground, their weight carried by the standing giver, who works from below.'),
    ('bent-supine-rimjob','Bent Supine Rimjob','The receiver lies on their back with the knees drawn toward the chest and the feet off the floor, the giver between the raised legs.'),
    ('bowing-rimjob','Bowing Rimjob','The receiver stands and hinges forward at the hips with a flat back while the giver works from behind.'),
    ('buck-rimjob','Buck Rimjob','The receiver braces on the hands or forearms on a raised surface with the thighs hooked over the standing giver''s arms.'),
    ('crab-rimjob','Crab Rimjob','The receiver is face up on the hands and feet with the hips lifted and the giver at the raised hips.'),
    ('doggy-rimjob','Doggy Rimjob','The receiver on hands and knees with the giver behind and below. The most common rimming position.'),
    ('floor-sitting-rimjob','Floor Sitting Rimjob','The receiver sits upright on the floor with the legs extended forward and the giver beneath the hips.'),
    ('headstand-rimjob','Headstand Rimjob','The receiver is inverted on the head and forearms with the back arched and the legs overhead, the giver upright at their hips.'),
    ('kneeling-rimjob','Kneeling Rimjob','The giver lies on their back while the receiver kneels astride their head and lowers the hips, facing either way.'),
    ('lateral-rimjob','Lateral Rimjob','The receiver lies with the torso twisted and the legs stacked to one side while the giver works from alongside.'),
    ('prone-rimjob','Prone Rimjob','The receiver lies face down propped on the forearms with the legs flat and the giver over the hips.'),
    ('shoulderstand-rimjob','Shoulderstand Rimjob','The receiver rests on the shoulders with the legs folded overhead toward the floor and the giver above the inverted hips.'),
    ('sitting-rimjob','Sitting Rimjob','The receiver holds a deep seated squat with the torso upright while the giver works from behind and beneath.'),
    ('squatting-rimjob','Squatting Rimjob','The giver lies on their back while the receiver squats over their head with the feet flat and the hips lowered.'),
    ('standing-rimjob','Standing Rimjob','The receiver stands upright with the legs straight while the giver kneels behind them.'),
    ('supine-rimjob','Supine Rimjob','The receiver lies on their back with the legs spread and bent and the feet planted, the giver between the legs.'),

    -- GROUP ─────────────────────────────────────────────────────────────────
    ('369','369','A 69 with a third person joining: two partners take each other orally while the third gives oral, rims or penetrates either of them.'),
    ('469','469','A 69 with two more people joining, each attending to one of the pair already taking each other orally. The four-person extension of 369.'),
    ('anal-train','Anal Train','Three or more people in a line, each penetrating the person in front of them.'),
    ('blow-rim-train','Blow Rim Train','A three-person line in which the first takes the second orally and the second rims the third.'),
    ('doubleheader','Doubleheader','One person takes two others orally at the same time.'),
    ('fuck-and-suck','Fuck and Suck','A three-person position in which the middle partner penetrates one person while taking a second orally.'),
    ('fuck-blow-sandwich','Fuck Blow Sandwich','A three-person position in which the middle partner is penetrated from behind while being taken orally from the front.'),
    ('fuck-rim-train','Fuck Rim Train','A three-person line in which the first penetrates the second and the second rims the third.'),
    ('oral-chain','Oral Chain','A closed ring of three or more people, each taking the next orally, so that everyone gives and receives at once. A chain differs from a train in that it closes.'),
    ('oral-sandwich','Oral Sandwich','One person taken orally by two others at the same time.'),
    ('oral-train','Oral Train','Three or more people in a line, each taking the person in front of them orally.'),
    ('perfecta','Perfecta','A three-person position in which the first takes the second orally while the second penetrates the third.'),
    ('rim-blow-sandwich','Rim Blow Sandwich','A three-person position in which the middle partner is rimmed from behind and taken orally from the front.'),
    ('rim-blow-train','Rim Blow Train','A three-person line in which the first rims the second and the second takes the third orally.'),
    ('rim-chain','Rim Chain','A closed ring of three or more people, each rimming the next.'),
    ('rim-fuck-train','Rim Fuck Train','A three-person line in which the first rims the second and the second penetrates the third.'),
    ('rim-sandwich','Rim Sandwich','One person rimmed by two others at the same time.'),
    ('rim-train','Rim Train','Three or more people in a line, each rimming the person in front of them.'),
    ('spit-roast','Spit Roast','A three-person position in which the middle partner is penetrated from behind while taking a third person orally. The best known group position by name.'),
    ('trifecta','Trifecta','A three-person position in which the first penetrates the second while the third takes the first orally and rims the second.'),
    ('tripleheader','Tripleheader','One person takes three others orally at the same time.')
  ) as v(slug, name, descr)
  where not exists (select 1 from unified_tags u where u.slug = v.slug);

  get diagnostics v_added = row_count;
  raise notice 'inserted % position tags', v_added;

  -- ── 2. file them ─────────────────────────────────────────────────────────
  -- No trigger does this on INSERT (see header note 1). Without it every row
  -- above stays is_adult=false and seo_indexable=true.
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select t.id, v_cat, true
  from unified_tags t
  where t.category_id = v_cat
  on conflict (tag_id, category_id) do nothing;
end $$;

-- ── 3. aliases ─────────────────────────────────────────────────────────────
-- review_status matters: an APPROVED alias is an auto-tagging rule in
-- run_tag_assignment_reconcile and is displayed as a synonym; an 'auto' one is
-- neither. Distinctive multi-word names are approved; the source's racialised
-- spellings and the ordinary-word ones are not.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, a.nm, a.sl, a.ty, a.rs
from (values
  ('cowboy',                  'Cowgirl',              'cowgirl',              'synonym','approved'),
  ('reverse-cowboy',          'Reverse Cowgirl',      'reverse-cowgirl',      'synonym','approved'),
  ('cowboy',                  'Rider',                'rider-position',       'synonym','approved'),
  ('spoons',                  'Spooning',             'spooning',             'synonym','auto'),
  ('prone-boning',            'Prone Bone',           'prone-bone',           'synonym','approved'),
  ('t-square',                'T Square',             't-square-spaced',      'spelling_variant','approved'),
  ('pirates-bounty',          'Pirates Bounty',       'pirates-bounty-noapos','spelling_variant','approved'),
  -- source spellings, deliberately NOT approved (header note 2)
  ('squatting-cowboy',        'Asian Cowboy',         'asian-cowboy',         'deprecated','auto'),
  ('reverse-squatting-cowboy','Reverse Asian Cowboy', 'reverse-asian-cowboy', 'deprecated','auto'),
  ('squatting-jockey',        'Asian Jockey',         'asian-jockey',         'deprecated','auto'),
  ('squatting-lap-dance',     'Asian Lap Dance',      'asian-lap-dance',      'deprecated','auto'),
  -- collision-disambiguated tags keep their bare source name, unapproved
  ('butterfly-position',      'Butterfly Position',   'butterfly-position-al','synonym','auto'),
  ('bully-position',          'Bully Position',       'bully-position-alias', 'synonym','auto'),
  ('bodyguard-position',      'Bodyguard Position',   'bodyguard-position-al','synonym','auto')
) as a(tag_slug, nm, sl, ty, rs)
join unified_tags t on t.slug = a.tag_slug
where not exists (select 1 from tag_aliases x where x.alias_slug = a.sl)
  -- tag_hygiene_stats().alias_equals_name is a zero-invariant
  and lower(a.nm) <> lower(t.name);

-- ── 3b. the two re-filed tags that arrived carrying a placeholder ──────────
-- `double-penetration` and `triple-penetration` were re-filed into this stop by
-- 20261023100000 still holding the string "Sexual activity tag" — one of the
-- four bulk-import stamps that `placeholder_description_active` tracks (63 rows
-- carry this one). The verify block below refuses a description under 40 chars,
-- and on the first deploy attempt it correctly RAISED on exactly these two and
-- rolled the whole migration back. Fixing them here rather than weakening the
-- assertion: they are in the stop now, so they meet the stop's bar.
--
-- Guarded on the placeholder text so this cannot clobber real prose written by
-- someone else in the meantime. Both rows are human_reviewed, so the
-- `app.actor` set at the top of this file is what keeps log_unified_tag_change()
-- from RAISING.
update unified_tags
   set description = case slug
         when 'double-penetration' then
           'Two people penetrating the same partner at the same time. A three-person position in which the middle partner receives both.'
         when 'triple-penetration' then
           'Three people penetrating the same partner at the same time. A four-person position, and the widest of the group set.'
       end
 where slug in ('double-penetration', 'triple-penetration')
   and coalesce(btrim(description), '') = 'Sexual activity tag';

-- ── 4. ontology edges ──────────────────────────────────────────────────────
-- ONLY 'broader' and 'related' are legal: tag_relations carries two
-- overlapping relation_type CHECKs and their intersection is those two.
-- Direction follows the corpus convention source = specific, target = general
-- (Forced Orgasm → Orgasm). 'broader' displays at auto; 'related' would need
-- approval, so the family edges are all broader.
insert into tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
select s.id, t.id, 'broader', 1.0, 'approved'
from (values
  -- variant → base
  ('squatting-cowboy','cowboy'),('reverse-cowboy','cowboy'),('reverse-squatting-cowboy','cowboy'),
  ('reverse-standing-cowboy','cowboy'),('sideways-cowboy','cowboy'),('cowboy-splits','cowboy'),
  ('standing-cowboy','cowboy'),
  ('elevated-doggy-style','doggy-style'),('sideways-doggy-style','doggy-style'),
  ('standing-doggy-style','doggy-style'),('doggy-blowjob','doggy-style'),('doggy-rimjob','doggy-style'),
  ('squatting-jockey','jockey'),('kneeling-jockey','jockey'),('standing-jockey','jockey'),
  ('squatting-lap-dance','lap-dance'),('floor-lap-dance','lap-dance'),
  ('kneeling-mastery','mastery'),('standing-mastery','mastery'),
  ('reverse-pile-driver','pile-driver'),('sideways-pile-driver','pile-driver'),
  ('reverse-warrior','warrior'),('reverse-kneeling-warrior','warrior'),
  ('reverse-bulldog','bulldog'),('elevated-bodyguard','bodyguard-position'),
  ('sitting-cannonball','cannonball'),('elevated-pirates-bounty','pirates-bounty'),
  ('sideways-rear-entry','rear-entry'),('reverse-soaring-eagle','soaring-eagle'),
  ('standing-leg-glider','leg-glider'),('bent-spoons','spoons'),('teaspoons','spoons'),
  -- oral families → the act
  ('kneeling-69','69'),('sideways-69','69'),('sitting-69','69'),('standing-69','69'),
  ('aerial-blowjob','blowjob'),('bent-supine-blowjob','blowjob'),('bowing-blowjob','blowjob'),
  ('buck-blowjob','blowjob'),('crab-blowjob','blowjob'),('doggy-blowjob','blowjob'),
  ('floor-sitting-blowjob','blowjob'),('headstand-blowjob','blowjob'),('kneeling-blowjob','blowjob'),
  ('lateral-blowjob','blowjob'),('prone-blowjob','blowjob'),('reverse-buck-blowjob','blowjob'),
  ('shoulderstand-blowjob','blowjob'),('sitting-blowjob','blowjob'),('squatting-blowjob','blowjob'),
  ('standing-blowjob','blowjob'),('supine-blowjob','blowjob'),
  ('aerial-rimjob','rimming'),('bent-supine-rimjob','rimming'),('bowing-rimjob','rimming'),
  ('buck-rimjob','rimming'),('crab-rimjob','rimming'),('doggy-rimjob','rimming'),
  ('floor-sitting-rimjob','rimming'),('headstand-rimjob','rimming'),('kneeling-rimjob','rimming'),
  ('lateral-rimjob','rimming'),('prone-rimjob','rimming'),('shoulderstand-rimjob','rimming'),
  ('sitting-rimjob','rimming'),('squatting-rimjob','rimming'),('standing-rimjob','rimming'),
  ('supine-rimjob','rimming'),
  -- group → group sex
  ('369','group-sex'),('469','group-sex'),('anal-train','group-sex'),('blow-rim-train','group-sex'),
  ('doubleheader','group-sex'),('fuck-and-suck','group-sex'),('fuck-blow-sandwich','group-sex'),
  ('fuck-rim-train','group-sex'),('oral-chain','group-sex'),('oral-sandwich','group-sex'),
  ('oral-train','group-sex'),('perfecta','group-sex'),('rim-blow-sandwich','group-sex'),
  ('rim-blow-train','group-sex'),('rim-chain','group-sex'),('rim-fuck-train','group-sex'),
  ('rim-sandwich','group-sex'),('rim-train','group-sex'),('spit-roast','group-sex'),
  ('trifecta','group-sex'),('tripleheader','group-sex'),
  ('double-penetration','group-sex'),('triple-penetration','group-sex'),
  -- penetrative positions → the act
  ('missionary','anal-sex'),('doggy-style','anal-sex'),('spoons','anal-sex'),('cowboy','anal-sex'),
  ('rear-entry','anal-sex'),('pile-driver','anal-sex'),('lotus','anal-sex'),('prone-boning','anal-sex'),
  ('scissors','anal-sex'),('warrior','anal-sex'),('jockey','anal-sex'),('lap-dance','anal-sex'),
  ('mastery','anal-sex'),('bulldog','anal-sex'),('bodyguard-position','anal-sex'),
  ('bully-position','anal-sex'),('butterfly-position','anal-sex'),('mutual-penetration','anal-sex')
) as e(src, tgt)
join unified_tags s on s.slug = e.src
join unified_tags t on t.slug = e.tgt
where s.id <> t.id
on conflict (source_tag_id, target_tag_id, relation_type) do nothing;

-- ── 5. verify ──────────────────────────────────────────────────────────────
do $$
declare
  v_total int; v_bad int;
begin
  select count(*) into v_total
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions' and t.status = 'active';
  if v_total < 140 then
    raise exception 'expected at least 140 tags in Positions, found %', v_total;
  end if;

  -- THE GATE. Two assertions, because the two columns have different rules.
  --
  -- is_adult applies to EVERY row in the stop, and it is the one that would
  -- have caught the INSERT-does-not-file defect in the header: no junction
  -- row means unified_tags_recompute_is_adult() never runs and this stays
  -- false.
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions' and t.is_adult is not true;
  if v_bad > 0 then
    raise exception '% position tags are not is_adult — junction row missing?', v_bad;
  end if;

  -- seo_indexable is only forced false by enforce_tag_seo_sensitivity_gate()
  -- when the row is NOT human_reviewed. A human-reviewed adult tag staying
  -- indexable is the doxy-pep precedent, not a defect, and two of the four
  -- re-filed tags (`69`, `doggy-style`) are exactly that shape — asserting
  -- `seo_indexable = false` across the whole stop would fail on them and be
  -- wrong to "fix". Every row this migration INSERTS is human_reviewed=false,
  -- so the gate governs all of them and they must all come out deindexed.
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions'
    and t.human_reviewed is not true
    and t.seo_indexable is not false;
  if v_bad > 0 then
    raise exception '% un-reviewed position tags are still indexable', v_bad;
  end if;

  -- text mirror must agree with category_id, or the page and the search
  -- facet disagree
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions' and t.category is distinct from c.name;
  if v_bad > 0 then
    raise exception '% position tags have a stale category text mirror', v_bad;
  end if;

  -- exactly one primary junction row each
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions'
    and (select count(*) from tag_category_assignments a
          where a.tag_id = t.id and a.is_primary) <> 1;
  if v_bad > 0 then
    raise exception '% position tags do not have exactly one primary category', v_bad;
  end if;

  -- no new twin names (the reconcile lookup keys on lower(name))
  select count(*) into v_bad from (
    select lower(name) from unified_tags
    where status = 'active' and merged_into_id is null
    group by lower(name) having count(*) > 1
  ) d;
  if v_bad > 14 then
    raise exception 'duplicate active tag names rose to % (was 14) — a position name collided', v_bad;
  end if;

  -- descriptions are real, not placeholders
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions'
    and (t.description is null or length(t.description) < 40);
  if v_bad > 0 then
    raise exception '% position tags have a missing or placeholder description', v_bad;
  end if;

  -- no wikidata identifiers (header note 4)
  select count(*) into v_bad
  from unified_tags t join tag_categories c on c.id = t.category_id
  where c.slug = 'sex-positions' and t.wikidata_id is not null;
  if v_bad > 0 then
    raise exception '% position tags carry a wikidata_id', v_bad;
  end if;

  raise notice 'Positions stop verified: % tags, all gated and filed', v_total;
end $$;
