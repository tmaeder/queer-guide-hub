-- Tag taxonomy v3, PR C (1/1): deterministic re-filing + kind backfill.
--
-- Applies the rule-based pass of the 2026-08-29 recategorization program.
-- Every rule here was validated against the live corpus before being written
-- (SQL sampling, 2026-08-29): the mat-/vibe- twin rule matches 33 active
-- tags; the geo rule matches 148 with 144 corroborated; the misfit lists
-- name tags that were read by hand. What the rules do not decide is left for
-- the scoped LLM pass + ai_suggestions review — a rule that guesses is how
-- the corpus got into this state.
--
-- Kinds of action:
--   move    — change the tag's primary stop (junction + mirrors)
--   unfile  — remove from the glossary tree entirely (the 20261004110400
--             food precedent): marketplace-attribute twins, drinks,
--             professions, junk. entity_kind records what the tag IS.
--   kind    — entity_kind backfill (in the search trigger's column list, so
--             these self-enqueue reindex).
--
-- Ordering: requires 20261006140000 (v3 tree). Asserted below.

set local statement_timeout = '600s';

do $$
begin
  if not exists (select 1 from tag_categories where slug = 'places-scene' and level = 0) then
    raise exception 'refile: apply 20261006140000 (taxonomy v3 tree) first';
  end if;
end $$;

do $$
declare
  v_active_before int;
  v_active_after int;
  v_moved int := 0;
  v_unfiled int := 0;
begin
  perform set_config('app.actor', 'migration:20261006140100_tag_refile_deterministic', true);

  select count(*) into v_active_before from unified_tags
  where status = 'active' and merged_into_id is null;

  -- ── Build the move map ─────────────────────────────────────────────────
  create temp table _move (tag_id uuid primary key, dest_slug text, kind text)
  on commit drop;

  -- Rule M1: name-list moves (hand-validated misfits). Names are matched
  -- case-insensitively against ACTIVE, unmerged tags only.
  insert into _move (tag_id, dest_slug, kind)
  select t.id, m.dest_slug, m.kind
  from unified_tags t
  join (values
    -- concepts that landed absurdly (usage counts from the 2026-08-29 audit)
    ('Hate Speech',            'violence-hate',        'concept'),
    ('Hate Crime',             'violence-hate',        'concept'),
    ('Hate Crimes',            'violence-hate',        'concept'),
    ('Gender-Affirming Care',  'trans-health',         'concept'),
    ('Hormone Therapy',        'trans-health',         'concept'),
    ('Gender Transition',      'trans-health',         'concept'),
    ('Suicide Prevention',     'mental-health',        'concept'),
    ('Coming Out',             'questioning-labels',   'concept'),
    ('Discrimination',         'political-activism',   'concept'),
    ('Transphobia',            'violence-hate',        'concept'),
    ('Homophobia',             'violence-hate',        'concept'),
    ('Violence',               'violence-hate',        'concept'),
    ('Rape',                   'violence-hate',        'concept'),
    ('Religion',               'religion-belief',      'concept'),
    ('Hindu',                  'religion-belief',      'concept'),
    ('Love',                   'dating-connection',    'concept'),
    ('Romance',                'dating-connection',    'concept'),
    ('Intimacy',               'dating-connection',    'concept'),
    ('Flirting',               'dating-connection',    'concept'),
    ('Same-Sex Marriage',      'marriage-partnership', 'concept'),
    ('Marriage-Equality',      'marriage-partnership', 'concept'),
    ('Wedding',                'marriage-partnership', 'concept'),
    ('Divorce',                'marriage-partnership', 'concept'),
    ('Drag',                   'drag-performance',     'concept'),
    ('Drag Queen',             'drag-performance',     'concept'),
    ('Drag King',              'drag-performance',     'concept'),
    ('Drag Culture',           'drag-performance',     'concept'),
    ('Voguing',                'drag-performance',     'concept'),
    ('Ballroom',               'subcultures',          'concept'),
    ('Ballroom Culture',       'subcultures',          'concept'),
    ('Burlesque',              'drag-performance',     'concept'),
    ('Cabaret',                'events-scene',         'descriptor'),
    -- umbrella terms filed at the old L0 or wrong stops
    ('LGBTIQ+',                'questioning-labels',   'concept'),
    ('LGBT+',                  'questioning-labels',   'concept'),
    ('Queerness',              'questioning-labels',   'concept'),
    ('Kink',                   'bdsm-power-exchange',  'concept'),
    ('Fetish',                 'fetishes-interests',   'concept'),
    ('BDSM',                   'bdsm-power-exchange',  'concept'),
    ('Bear',                   'kink-community',       'concept'),
    ('Twink',                  'kink-community',       'concept'),
    ('Otter',                  'kink-community',       'concept'),
    -- venue concepts filed as kink/health
    ('Sauna',                  'venues-nightlife',     'descriptor'),
    ('Bathhouse',              'venues-nightlife',     'descriptor'),
    ('Gym',                    'venues-nightlife',     'descriptor'),
    ('Museum',                 'venues-nightlife',     'descriptor'),
    ('Yoga',                   'sports-recreation',    'descriptor'),
    ('Fitness',                'sports-recreation',    'descriptor'),
    ('Swimming',               'sports-recreation',    'descriptor'),
    -- venue features / policies
    ('Clothing-Optional',      'safe-spaces',          'descriptor'),
    ('Nudist',                 'safe-spaces',          'descriptor'),
    ('Naturist',               'safe-spaces',          'descriptor'),
    ('Naturism',               'safe-spaces',          'descriptor'),
    ('Adult-Oriented',         'safe-spaces',          'descriptor'),
    ('Adult',                  'safe-spaces',          'descriptor'),
    ('Adult-Entertainment',    'safe-spaces',          'descriptor'),
    ('Men-Only',               'safe-spaces',          'descriptor'),
    ('Accessibility',          'safe-spaces',          'descriptor'),
    ('Accessible',             'safe-spaces',          'descriptor'),
    ('Gay-Owned',              'safe-spaces',          'descriptor'),
    ('LGBTQ-Owned',            'safe-spaces',          'descriptor'),
    ('LGBTQ-Friendly',         'safe-spaces',          'descriptor'),
    ('Cruising',               'safe-spaces',          'descriptor'),
    -- audiences
    ('Everyday',               'audiences',            'audience'),
    ('Youth',                  'audiences',            'audience'),
    ('Seniors',                'audiences',            'audience'),
    ('Family-Friendly',        'audiences',            'audience'),
    ('Families',               'audiences',            'audience'),
    ('BIPOC',                  'audiences',            'audience'),
    ('Senior-Focused',         'audiences',            'audience'),
    -- vibe / crowd descriptors
    ('Party',                  'vibe-crowd',           'descriptor'),
    ('Casual',                 'vibe-crowd',           'descriptor'),
    ('Mixed-Crowd',            'vibe-crowd',           'descriptor'),
    ('Vintage',                'vibe-crowd',           'descriptor'),
    ('Metal',                  'vibe-crowd',           'descriptor'),
    ('Gothic',                 'vibe-crowd',           'descriptor'),
    ('Punk',                   'vibe-crowd',           'descriptor'),
    ('Gaming',                 'vibe-crowd',           'descriptor'),
    -- sports (from Current Affairs / Body Types / events)
    ('Sports',                 'sports-recreation',    'descriptor'),
    ('Sport',                  'sports-recreation',    'descriptor'),
    ('Football',               'sports-recreation',    'descriptor'),
    ('Americanfootball',       'sports-recreation',    'descriptor'),
    ('Soccer',                 'sports-recreation',    'descriptor'),
    ('Baseball',               'sports-recreation',    'descriptor'),
    ('Rugby',                  'sports-recreation',    'descriptor'),
    ('Wrestling',              'sports-recreation',    'descriptor'),
    ('World-Cup',              'sports-recreation',    'descriptor'),
    ('Paralympics',            'sports-recreation',    'descriptor'),
    ('Eurogames',              'sports-recreation',    'descriptor'),
    ('Transgender Athletes',   'sports-recreation',    'concept'),
    ('Qigong',                 'sports-recreation',    'descriptor'),
    ('Taiji',                  'sports-recreation',    'descriptor'),
    -- news topics re-filed by subject (Current Affairs dissolves)
    ('Politics',               'political-activism',   'concept'),
    ('Legislation',            'legal-rights',         'concept'),
    ('Censorship',             'political-activism',   'concept'),
    ('Education',              'workplace-education-policy', 'concept'),
    ('Transgender Rights',     'legal-rights',         'concept'),
    ('Culture & Entertainment','media-film-music',     'concept'),
    ('Pride',                  'events-scene',         'descriptor'),
    -- rights-activism L0 directs
    ('Inclusion',              'political-activism',   'concept'),
    ('Inclusivity',            'political-activism',   'concept'),
    ('Ableism',                'violence-hate',        'concept'),
    ('Prejudice',              'violence-hate',        'concept'),
    ('Disability Rights',      'legal-rights',         'concept'),
    -- community-culture L0 directs
    ('Socializing',            'support-services',     'descriptor'),
    ('Meetup',                 'support-services',     'descriptor'),
    ('Community-Group',        'support-services',     'descriptor'),
    ('Community',              'support-services',     'concept'),
    -- health leftovers
    ('Health Services',        'physical-reproductive','concept'),
    ('Health-Care',            'physical-reproductive','concept'),
    ('Blood-Donation',         'physical-reproductive','concept'),
    -- kink event formats that sat in events-scene (adult under v3)
    ('Munch',                  'kink-community',       'concept'),
    ('Fetish Party',           'kink-community',       'concept'),
    ('Sex Party',              'kink-community',       'concept'),
    ('Play Party',             'kink-community',       'concept'),
    ('Swingers Party',         'kink-community',       'concept'),
    ('Gangbang Party',         'kink-community',       'concept'),
    ('Masturbation Party',     'kink-community',       'concept'),
    ('Fetnight',               'kink-community',       'concept'),
    ('Party & Play',           'kink-community',       'concept'),
    ('History',                'movements-milestones', 'concept'),
    ('LGBT History',           'movements-milestones', 'concept'),
    ('Legacy',                 'movements-milestones', 'concept')
  ) as m(name, dest_slug, kind)
    on lower(t.name) = lower(m.name)
  where t.merged_into_id is null and t.status = 'active'
  on conflict (tag_id) do nothing;

  -- Rule M2: geographic tags -> Destinations + kind=place. Corroboration
  -- required (the same-name-collision lesson): the name must match a country
  -- or a city AND the tag must already sit in a geo-adjacent stop
  -- (travel-destinations, venues-nightlife, history-heritage, events-scene)
  -- — "Friendship", "Reading", "Orange" match city names while being real
  -- concepts filed elsewhere, and a bare name match would eat them.
  insert into _move (tag_id, dest_slug, kind)
  select t.id, 'travel-destinations', 'place'
  from unified_tags t
  join tag_category_assignments a on a.tag_id = t.id and a.is_primary
  join tag_categories c on c.id = a.category_id
  where t.merged_into_id is null and t.status = 'active'
    and c.slug in ('travel-destinations','venues-nightlife','history-heritage','events-scene')
    and (
      exists (select 1 from countries co where lower(co.name) = lower(replace(t.name,'-',' ')))
      or exists (select 1 from cities ci where ci.duplicate_of_id is null
                   and lower(ci.name) = lower(replace(t.name,'-',' ')))
    )
  on conflict (tag_id) do nothing;

  -- ── Build the unfile set ───────────────────────────────────────────────
  create temp table _unfile (tag_id uuid primary key, kind text) on commit drop;

  -- Rule U1: marketplace attribute twins. An active tag whose slug also
  -- exists under the mat-/vibe- namespace is the un-prefixed duplicate of a
  -- marketplace facet (Spandex x3,044, Bold, Cotton, ...). Kept OUT of the
  -- glossary tree per the namespace rule; keep-list for genuine kink-gear
  -- concepts whose glossary entry must survive (Leather, Rubber, Latex).
  insert into _unfile (tag_id, kind)
  select t.id, 'attribute'
  from unified_tags t
  where t.merged_into_id is null and t.status = 'active'
    and (exists (select 1 from unified_tags m where m.slug = 'mat-' || t.slug)
      or exists (select 1 from unified_tags v where v.slug = 'vibe-' || t.slug))
    and lower(t.name) not in ('leather','rubber','latex','vintage','metal','gothic')
  on conflict (tag_id) do nothing;

  -- Rule U2: drinks — same class as the food unfile (20261004110400):
  -- merchandise/menu nouns, not glossary terms. 'Alcohol' itself stays in
  -- Substances & Recovery (it IS the substance concept).
  insert into _unfile (tag_id, kind)
  select t.id, 'descriptor'
  from unified_tags t
  where t.merged_into_id is null and t.status = 'active'
    and lower(t.name) in ('beer','wine','vodka','gin','whiskey','whisky','rum','tequila',
      'cocktails','cocktail','craft-beer','prosecco','champagne','cider',
      'coffee','lunch','dinner','snacks','brunch','breakfast')
  on conflict (tag_id) do nothing;

  -- Rule U3: professions — they have their own vocabulary (public.professions)
  -- and describe personalities, not glossary concepts.
  insert into _unfile (tag_id, kind)
  select t.id, 'descriptor'
  from unified_tags t
  join tag_category_assignments a on a.tag_id = t.id and a.is_primary
  join tag_categories c on c.id = a.category_id and c.slug = 'professions-allies'
  where t.merged_into_id is null and t.status = 'active'
  on conflict (tag_id) do nothing;

  -- A tag cannot be both moved and unfiled; unfile wins (it is the stronger
  -- judgement about what the tag is).
  delete from _move mv using _unfile u where mv.tag_id = u.tag_id;

  -- ── Apply moves ────────────────────────────────────────────────────────
  -- 1) new primary junction rows
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select mv.tag_id, tc.id, true
  from _move mv join tag_categories tc on tc.slug = mv.dest_slug
  on conflict (tag_id, category_id) do update set is_primary = true;

  -- 2) demote every other primary for the moved tags
  update tag_category_assignments a
     set is_primary = false
  from _move mv join tag_categories tc on tc.slug = mv.dest_slug
  where a.tag_id = mv.tag_id and a.category_id <> tc.id and a.is_primary;

  -- 3) drop junction residue pointing at OLD-tree categories (old roots and
  --    the stops v3 dissolves) for the moved tags, so PR E's zero-assertions
  --    hold without a second sweep.
  delete from tag_category_assignments a
  using _move mv, tag_categories c
  where a.tag_id = mv.tag_id and a.category_id = c.id
    and (
      (c.level = 0 and c.slug in ('identity-expression','sexuality-kink',
        'relationships-connection','health-wellness','safety-practices',
        'community-culture','history-heritage','rights-activism',
        'places-travel','support-news'))
      or c.slug in ('care-access','current-affairs','professions-allies')
    );

  -- 4) mirrors + kind (one UPDATE per tag — the `category` text write is
  --    what fires the column-scoped search trigger)
  update unified_tags u
     set category_id = tc.id,
         category    = tc.name,
         entity_kind = mv.kind::tag_entity_kind
  from _move mv join tag_categories tc on tc.slug = mv.dest_slug
  where u.id = mv.tag_id;

  get diagnostics v_moved = row_count;

  -- Secondary home: Cruising keeps a kink-practice cross-listing.
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select t.id, tc.id, false
  from unified_tags t, tag_categories tc
  where lower(t.name) = 'cruising' and t.status = 'active' and t.merged_into_id is null
    and tc.slug = 'practices-play'
  on conflict (tag_id, category_id) do nothing;

  -- ── Apply unfiles ──────────────────────────────────────────────────────
  delete from tag_category_assignments a using _unfile u where a.tag_id = u.tag_id;

  update unified_tags t
     set category_id = null,
         category    = null,
         entity_kind = u.kind::tag_entity_kind
  from _unfile u
  where t.id = u.tag_id;

  get diagnostics v_unfiled = row_count;

  -- ── Kind backfill for tags already in the right stop ───────────────────
  -- Whole descriptor stops: everything primarily filed there is a
  -- descriptor/place/audience by construction of the v3 tree.
  update unified_tags t
     set entity_kind = ck.kind::tag_entity_kind
  from tag_category_assignments a, tag_categories c,
       (values ('venues-nightlife','descriptor'), ('safe-spaces','descriptor'),
               ('events-scene','descriptor'), ('accommodation','descriptor'),
               ('vibe-crowd','descriptor'), ('support-services','descriptor'),
               ('audiences','audience'), ('travel-destinations','place')
       ) as ck(slug, kind)
  where a.tag_id = t.id and a.is_primary and c.id = a.category_id
    and c.slug = ck.slug
    and t.entity_kind is distinct from ck.kind::tag_entity_kind;

  -- Person-kind: figures-icons (People & Icons) rows that look like personal
  -- names (two+ capitalised words). Kind-marking only — disposition (link to
  -- personalities / deprecate) is a later, human-reviewed step. PR D hides
  -- kind=person from the public index.
  update unified_tags t
     set entity_kind = 'person'
  from tag_category_assignments a, tag_categories c
  where a.tag_id = t.id and a.is_primary and c.id = a.category_id
    and c.slug = 'figures-icons'
    and t.name ~ '^[[:upper:]][[:alpha:]''.-]+( [[:upper:]][[:alpha:]''.-]+)+$'
    and t.entity_kind is distinct from 'person';

  -- Marketplace namespace tags: kind=attribute (slug prefix is the key).
  update unified_tags t
     set entity_kind = 'attribute'
  where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
    and t.entity_kind is distinct from 'attribute';

  -- ── Postconditions ─────────────────────────────────────────────────────
  select count(*) into v_active_after from unified_tags
  where status = 'active' and merged_into_id is null;
  if v_active_after <> v_active_before then
    raise exception 'refile: active count changed (% -> %) — this migration must not touch status',
      v_active_before, v_active_after;
  end if;

  if exists (
    select 1 from tag_category_assignments a
    group by a.tag_id having count(*) filter (where a.is_primary) > 1) then
    raise exception 'refile: duplicate primaries created';
  end if;

  raise notice 'refile: % moved, % unfiled', v_moved, v_unfiled;
end $$;
