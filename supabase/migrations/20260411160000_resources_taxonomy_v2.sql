-- Resources taxonomy v2: full wipe + reseed of tag_categories.
--
-- Replaces the old 14-parent / 23-child hierarchy (where ~2,332 of 3,138 active
-- tags sat only at parent level) with 10 parents × ~5 children, and rewrites
-- tag_category_assignments so every tag has exactly ONE primary assignment
-- pointing at a level-1 child.
--
-- Old assignments are preserved in _tag_category_assignments_backup_v1 for
-- 1-line rollback. Idempotent: safe to re-run.

BEGIN;

-- 1. Backup current assignments (no-op if already exists)
CREATE TABLE IF NOT EXISTS public._tag_category_assignments_backup_v1 AS
SELECT * FROM public.tag_category_assignments;

-- 2. Upsert new parent categories by slug (preserves IDs of any reused slugs)
INSERT INTO public.tag_categories (name, slug, description, color, sort_order, level, parent_id)
VALUES
  ('Identity & Expression',        'identity-expression',        'Sexual orientation, gender identity, expression and intersex topics', '#ec4899',  1, 0, NULL),
  ('Sexuality & Kink',             'sexuality-kink',             'Sexual roles, kinks, fetishes, play, gear and body archetypes',       '#f43f5e',  2, 0, NULL),
  ('Relationships & Connection',   'relationships-connection',   'Relationship structures, dating, family and community ties',          '#f97316',  3, 0, NULL),
  ('Health & Wellness',            'health-wellness',            'Sexual, mental, physical and reproductive health, substances, care',   '#14b8a6',  4, 0, NULL),
  ('Safety & Practices',           'safety-practices',           'Consent, safer sex, personal and digital safety, risk-aware play',    '#06b6d4',  5, 0, NULL),
  ('Community & Culture',          'community-culture',          'Slang, media, art, events and subcultures',                            '#8b5cf6',  6, 0, NULL),
  ('History & Heritage',           'history-heritage',           'Movements, figures, regional history and symbols',                     '#a855f7',  7, 0, NULL),
  ('Rights & Activism',            'rights-activism',            'Legal rights, political activism and policy',                          '#3b82f6',  8, 0, NULL),
  ('Places & Travel',              'places-travel',              'Venues, travel, safe spaces and accommodation',                        '#10b981',  9, 0, NULL),
  ('Support & News',               'support-news',               'Helplines, support services, current affairs and allies',              '#eab308', 10, 0, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  color       = EXCLUDED.color,
  sort_order  = EXCLUDED.sort_order,
  level       = 0,
  parent_id   = NULL;

-- 3. Capture the old assignments BEFORE we touch children or wipe anything.
--    For each tag we record the old parent slug and (if assigned directly to a
--    level-1 child) the old child slug. Prefer primary assignments, then the
--    deepest category.
DROP TABLE IF EXISTS _v2_old_assign;
CREATE TEMP TABLE _v2_old_assign ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    tca.tag_id,
    tc.slug  AS cat_slug,
    tc.level AS cat_level,
    tc.parent_id,
    ROW_NUMBER() OVER (
      PARTITION BY tca.tag_id
      ORDER BY tca.is_primary DESC, tc.level DESC, tc.sort_order NULLS LAST
    ) AS rn
  FROM public.tag_category_assignments tca
  JOIN public.tag_categories tc ON tc.id = tca.category_id
)
SELECT
  r.tag_id,
  CASE WHEN r.cat_level = 1 THEN r.cat_slug ELSE NULL END AS old_child_slug,
  CASE
    WHEN r.cat_level = 0 THEN r.cat_slug
    ELSE (SELECT p.slug FROM public.tag_categories p WHERE p.id = r.parent_id)
  END AS old_parent_slug
FROM ranked r
WHERE r.rn = 1;

-- 4. Upsert new child categories. parent_id is resolved via the freshly-upserted
--    parents so no UUIDs are hardcoded.
WITH parents AS (
  SELECT id, slug FROM public.tag_categories WHERE level = 0
),
new_children(name, slug, description, sort_order, parent_slug) AS (
  VALUES
    -- Identity & Expression
    ('Sexual Orientation',       'sexual-orientation',       'Gay, lesbian, bi, pan, ace and other orientations',         1, 'identity-expression'),
    ('Gender Identity',          'gender-identity',          'Trans, non-binary, genderqueer and gender diverse',         2, 'identity-expression'),
    ('Expression & Presentation','expression-presentation',  'Drag, femme/masc, style, aesthetic presentation',           3, 'identity-expression'),
    ('Intersex & Bodies',        'intersex-bodies',          'Intersex variations and embodiment',                        4, 'identity-expression'),
    ('Questioning & Labels',     'questioning-labels',       'Coming out, labels in flux, questioning identity',          5, 'identity-expression'),
    -- Sexuality & Kink
    ('Sexual Roles',             'sexual-roles',             'Top, bottom, vers, giver, receiver and positions',          1, 'sexuality-kink'),
    ('BDSM & Power Exchange',    'bdsm-power-exchange',      'Dom/sub, D/s, master/slave, protocols and dynamics',        2, 'sexuality-kink'),
    ('Fetishes & Interests',     'fetishes-interests',       'Foot, medical, uniform, age play and other fetishes',       3, 'sexuality-kink'),
    ('Practices & Play',         'practices-play',           'Rope, impact, edging, fisting, watersports and more',       4, 'sexuality-kink'),
    ('Gear & Aesthetics',        'gear-aesthetics',          'Leather, harnesses, latex, rubber, boots, uniforms',        5, 'sexuality-kink'),
    ('Body Types & Archetypes',  'body-types-archetypes',    'Bear, otter, twink, cub, daddy, jock and other archetypes', 6, 'sexuality-kink'),
    -- Relationships & Connection
    ('Relationship Structures',  'relationship-structures',  'Monogamy, polyamory, open, relationship anarchy',           1, 'relationships-connection'),
    ('Dating & Courtship',       'dating-courtship',         'Dating, flirting, hookups, courtship practices',            2, 'relationships-connection'),
    ('Family & Chosen Family',   'family-chosen-family',     'Chosen family, parenting, biological family, kinship',      3, 'relationships-connection'),
    ('Friendship & Community',   'friendship-community',     'Friendships, community ties, belonging',                    4, 'relationships-connection'),
    -- Health & Wellness
    ('Sexual Health',            'sexual-health',            'STI, PrEP, PEP, testing, safer sex information',            1, 'health-wellness'),
    ('Mental Health',            'mental-health',            'Mental health, therapy, wellbeing, minority stress',        2, 'health-wellness'),
    ('Physical & Reproductive',  'physical-reproductive',    'Physical wellness, reproductive and hormonal health',       3, 'health-wellness'),
    ('Substances & Harm Reduction','substances-harm-reduction','Drugs, chemsex, harm reduction, recovery',                4, 'health-wellness'),
    ('Care Access',              'care-access',              'Insurance, clinics, providers, access to care',             5, 'health-wellness'),
    -- Safety & Practices
    ('Consent & Negotiation',    'consent-negotiation',      'Consent frameworks, negotiation, aftercare',                1, 'safety-practices'),
    ('Safer Sex',                'safer-sex',                'Safer sex practices, barriers, testing routines',           2, 'safety-practices'),
    ('Physical & Digital Safety','physical-digital-safety',  'Personal safety, digital privacy, stalking, doxxing',       3, 'safety-practices'),
    ('Risk-Aware Play',          'risk-aware-play',          'RACK, SSC, edge-play safety, risk awareness',               4, 'safety-practices'),
    -- Community & Culture
    ('Slang & Terminology',      'slang-terminology',        'Queer slang, terminology and language',                     1, 'community-culture'),
    ('Media, Film & Music',      'media-film-music',         'Queer film, TV, music and podcasts',                        2, 'community-culture'),
    ('Art, Literature & Zines',  'art-literature-zines',     'Visual art, literature, zines, queer publishing',           3, 'community-culture'),
    ('Events & Scene',           'events-scene',             'Prides, parties, circuit events, ballroom scene',           4, 'community-culture'),
    ('Subcultures',              'subcultures',              'Leather, bear, ball, club kid and other subcultures',       5, 'community-culture'),
    -- History & Heritage
    ('Movements & Milestones',   'movements-milestones',     'Stonewall, ACT UP, milestones in queer liberation',         1, 'history-heritage'),
    ('Figures & Icons',          'figures-icons',            'Historical figures, icons, trailblazers',                   2, 'history-heritage'),
    ('Queer History by Region',  'history-by-region',        'Regional and national queer histories',                     3, 'history-heritage'),
    ('Symbols & Flags',          'symbols-flags',            'Flags, symbols, coded signals through history',             4, 'history-heritage'),
    -- Rights & Activism
    ('Legal Rights',             'legal-rights',             'Marriage, adoption, gender recognition, anti-discrimination',1, 'rights-activism'),
    ('Political Activism',       'political-activism',       'Political movements, advocacy, protest',                    2, 'rights-activism'),
    ('Workplace, Education & Policy','workplace-education-policy','Workplace, schools, policy reform',                     3, 'rights-activism'),
    ('Global & Regional Rights', 'global-regional-rights',   'International rights, country-level status',                4, 'rights-activism'),
    -- Places & Travel
    ('Venues & Nightlife',       'venues-nightlife',         'Bars, clubs, saunas, cruise venues',                        1, 'places-travel'),
    ('Travel & Destinations',    'travel-destinations',      'Travel, destinations, itineraries',                         2, 'places-travel'),
    ('Safe Spaces',              'safe-spaces',              'Safe spaces, neighborhoods, community hubs',                3, 'places-travel'),
    ('Accommodation',            'accommodation',            'Hotels, hostels, homestays and queer-friendly stays',       4, 'places-travel'),
    -- Support & News
    ('Helplines & Hotlines',     'helplines-hotlines',       'Crisis lines, helplines and immediate support',             1, 'support-news'),
    ('Support Services & NGOs',  'support-services',         'Non-profits, NGOs, community support organisations',       2, 'support-news'),
    ('Current Affairs',          'current-affairs',          'News topics, current affairs affecting queer communities',  3, 'support-news'),
    ('Professions & Allies',     'professions-allies',       'Professions, allies, allied organisations',                 4, 'support-news')
)
INSERT INTO public.tag_categories (name, slug, description, sort_order, level, parent_id)
SELECT nc.name, nc.slug, nc.description, nc.sort_order, 1, p.id
FROM new_children nc
JOIN parents p ON p.slug = nc.parent_slug
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order,
  level       = 1,
  parent_id   = EXCLUDED.parent_id;

-- 5. Build the remap: one row per tag → exactly one new child slug.
--    Three first-match-wins passes, all collapsed into a single COALESCE chain.
DROP TABLE IF EXISTS _v2_bucketing;
CREATE TEMP TABLE _v2_bucketing ON COMMIT DROP AS
SELECT
  t.id AS tag_id,
  COALESCE(
    -- Pass 1: high-confidence keyword rules, only when old parent is Kink/Roles.
    CASE WHEN oa.old_parent_slug IN ('kink-fetish','roles-dynamics') THEN
      CASE
        WHEN t.name ~* '\y(bear|otter|twink|cub|chub|wolf|bull|jock|gainer|pup|puppy|pig|daddy|mommy|boi)\y'
          AND t.name !~* '\y(dom|master|mistress|slave|sub\w*)\y'
          THEN 'body-types-archetypes'
        WHEN t.name ~* '\y(harness|chaps|latex|rubber|leather|uniform|jockstrap|zentai|pvc|hood|collar|boot|gear|wetsuit|neoprene)\y'
          THEN 'gear-aesthetics'
        WHEN t.name ~* '\y(dom(me|inant)?|sub(missive)?|master|mistress|slave|dungeon|protocol|brat|cuck|sir|ma''?am|owner|handler|pet)\y'
          THEN 'bdsm-power-exchange'
        WHEN t.name ~* '\y(rope|shibari|bondage|impact|spank|flog|whip|wax|electro|edge|piss|scat|breath|watersport|knife|gun|fire\s*play|cbt|cnc|cage|chastity|suspension|fisting)\y'
          THEN 'practices-play'
        WHEN t.name ~* '^(top|bottom|vers(atile)?|switch|giver|receiver)$'
          THEN 'sexual-roles'
      END
    END,
    -- Pass 2: old child slug → new child slug direct mapping
    CASE oa.old_child_slug
      WHEN 'sexual-orientation'    THEN 'sexual-orientation'
      WHEN 'gender-identity'       THEN 'gender-identity'
      WHEN 'expression-presentation' THEN 'expression-presentation'
      WHEN 'intersex'              THEN 'intersex-bodies'
      WHEN 'bdsm'                  THEN 'bdsm-power-exchange'
      WHEN 'leather-gear'          THEN 'gear-aesthetics'
      WHEN 'fetish-practices'      THEN 'practices-play'
      WHEN 'body-modification'     THEN 'fetishes-interests'
      WHEN 'power-exchange'        THEN 'bdsm-power-exchange'
      WHEN 'relationship-roles'    THEN 'bdsm-power-exchange'
      WHEN 'sexual-roles'          THEN 'sexual-roles'
      WHEN 'sexual-health'         THEN 'sexual-health'
      WHEN 'mental-health'         THEN 'mental-health'
      WHEN 'physical-wellness'     THEN 'physical-reproductive'
      WHEN 'reproductive-health'   THEN 'physical-reproductive'
      WHEN 'legal-rights'          THEN 'legal-rights'
      WHEN 'political-activism'    THEN 'political-activism'
      WHEN 'historical-movements'  THEN 'movements-milestones'
      WHEN 'workplace-education'   THEN 'workplace-education-policy'
      WHEN 'slang-terminology'     THEN 'slang-terminology'
      WHEN 'media-entertainment'   THEN 'media-film-music'
      WHEN 'art-literature'        THEN 'art-literature-zines'
      WHEN 'history-heritage'      THEN 'movements-milestones'
    END,
    -- Pass 3: old parent fallback
    CASE oa.old_parent_slug
      WHEN 'identity-orientation'       THEN 'sexual-orientation'
      WHEN 'kink-fetish'                THEN 'fetishes-interests'
      WHEN 'roles-dynamics'             THEN 'bdsm-power-exchange'
      WHEN 'health-wellness'            THEN 'sexual-health'
      WHEN 'substances-harm-reduction'  THEN 'substances-harm-reduction'
      WHEN 'rights-activism'            THEN 'legal-rights'
      WHEN 'relationships'              THEN 'relationship-structures'
      WHEN 'community-events'           THEN 'events-scene'
      WHEN 'culture-slang'              THEN 'slang-terminology'
      WHEN 'venue-travel'               THEN 'venues-nightlife'
      WHEN 'news-topics'                THEN 'current-affairs'
      WHEN 'safety-practices'           THEN 'consent-negotiation'
      WHEN 'support-resources'          THEN 'support-services'
      WHEN 'miscellaneous'              THEN 'slang-terminology'
    END,
    -- Ultimate fallback for tags that never had any assignment at all
    'slang-terminology'
  ) AS new_child_slug
FROM public.unified_tags t
LEFT JOIN _v2_old_assign oa ON oa.tag_id = t.id;

CREATE UNIQUE INDEX ON _v2_bucketing (tag_id);

-- 6. Wipe the old assignments (backup exists from step 1) and re-insert from
--    the bucket. Every tag ends up with exactly one primary assignment.
DELETE FROM public.tag_category_assignments;

INSERT INTO public.tag_category_assignments (tag_id, category_id, is_primary)
SELECT b.tag_id, c.id, true
FROM _v2_bucketing b
JOIN public.tag_categories c ON c.slug = b.new_child_slug AND c.level = 1;

-- 7. Drop orphan categories (slugs not in the v2 set). Children first to avoid
--    self-FK violations, then parents.
DELETE FROM public.tag_categories
WHERE level = 1
  AND slug NOT IN (
    'sexual-orientation','gender-identity','expression-presentation','intersex-bodies','questioning-labels',
    'sexual-roles','bdsm-power-exchange','fetishes-interests','practices-play','gear-aesthetics','body-types-archetypes',
    'relationship-structures','dating-courtship','family-chosen-family','friendship-community',
    'sexual-health','mental-health','physical-reproductive','substances-harm-reduction','care-access',
    'consent-negotiation','safer-sex','physical-digital-safety','risk-aware-play',
    'slang-terminology','media-film-music','art-literature-zines','events-scene','subcultures',
    'movements-milestones','figures-icons','history-by-region','symbols-flags',
    'legal-rights','political-activism','workplace-education-policy','global-regional-rights',
    'venues-nightlife','travel-destinations','safe-spaces','accommodation',
    'helplines-hotlines','support-services','current-affairs','professions-allies'
  );

DELETE FROM public.tag_categories
WHERE level = 0
  AND slug NOT IN (
    'identity-expression','sexuality-kink','relationships-connection','health-wellness','safety-practices',
    'community-culture','history-heritage','rights-activism','places-travel','support-news'
  );

-- 8. Assertions (fail the migration and rollback on unexpected state).
DO $$
DECLARE
  total_tags      int;
  total_assigns   int;
  dup_count       int;
  missing_primary int;
  parent_count    int;
  child_count     int;
BEGIN
  SELECT COUNT(*) INTO total_tags    FROM public.unified_tags;
  SELECT COUNT(*) INTO total_assigns FROM public.tag_category_assignments;
  IF total_assigns < total_tags THEN
    RAISE EXCEPTION 'taxonomy v2: % tags but only % assignments', total_tags, total_assigns;
  END IF;

  SELECT COUNT(*) INTO dup_count
  FROM (SELECT tag_id FROM public.tag_category_assignments GROUP BY tag_id HAVING COUNT(*) > 1) x;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'taxonomy v2: % tags have more than one assignment', dup_count;
  END IF;

  SELECT COUNT(*) INTO missing_primary
  FROM public.unified_tags t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tag_category_assignments a
    WHERE a.tag_id = t.id AND a.is_primary = true
  );
  IF missing_primary > 0 THEN
    RAISE EXCEPTION 'taxonomy v2: % tags missing a primary assignment', missing_primary;
  END IF;

  SELECT COUNT(*) INTO parent_count FROM public.tag_categories WHERE level = 0;
  SELECT COUNT(*) INTO child_count  FROM public.tag_categories WHERE level = 1;
  IF parent_count <> 10 THEN
    RAISE EXCEPTION 'taxonomy v2: expected 10 parent categories, found %', parent_count;
  END IF;
  IF child_count <> 45 THEN
    RAISE EXCEPTION 'taxonomy v2: expected 45 child categories, found %', child_count;
  END IF;
END $$;

COMMIT;
