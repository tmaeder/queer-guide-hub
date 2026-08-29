-- Tag taxonomy v3 (PR B of the 2026-08-29 recategorization program).
--
-- The v2 tree (10 lines x 38 stops) failed for a measured reason: the corpus
-- mixes KINDS (dictionary concepts, content descriptors, places, marketplace
-- attribute twins, audiences, proper names) and the v2 stops were not
-- kind-homogeneous, so bulk LLM filing produced Spandex under Expression,
-- Gym under Physical & Reproductive health, Beer beside Fentanyl under Harm
-- Reduction, Sauna under Fetishes. v3 is 8 lines whose stops are each
-- homogeneous in kind; descriptors get an honest line (Places & Scene).
--
-- MECHANICS — hybrid clean-slate. The RESULT is the new 8-line tree, but a
-- stop that survives conceptually keeps its ROW: re-parented (and mostly
-- renamed) in place, preserving its slug, its /tags/c/ URL and its junction
-- rows. Only genuinely new stops are inserted. Full row replacement was
-- measured and rejected: it forces disjoint slugs (`sexual-health` is taken
-- by the row being deleted) and rewrites ~6.8k junction rows for nothing.
--
-- Old L0 roots and the non-surviving stops (sexual-roles,
-- body-types-archetypes -> merged here; care-access, current-affairs,
-- professions-allies -> re-filed by rules in PR C) are DELETED IN PR E, not
-- here — the frontend swap in this same deploy keys the rail on parentOrder,
-- so the leftovers are invisible, and deleting before their tags are re-filed
-- would silently uncategorize them (unified_tags_category_id_fkey is ON
-- DELETE SET NULL).
--
-- Ordering: 20261006090100 (is_adult recompute union) MUST be applied first —
-- asserted below rather than assumed, because a junction row moved into a
-- renamed kink stop under the OLD recompute flips is_adult=false on a live
-- adult tag.

set local statement_timeout = '600s';

do $$
declare
  v_fn text;
  v_collisions int;
begin
  -- Precondition 1: the widened is_adult recompute is live.
  v_fn := pg_get_functiondef('public.unified_tags_recompute_is_adult()'::regprocedure);
  if v_fn not like '%Sex & Kink%' then
    raise exception 'taxonomy v3: apply 20261006090100 (is_adult union) first';
  end if;

  -- Precondition 2: every NEW slug is absent (a collision would silently
  -- mutate an existing row via upsert instead of creating a new one).
  select count(*) into v_collisions from tag_categories where slug in (
    'identity','sex-kink','relationships-family','health','safety-consent',
    'culture-community','history-rights','places-scene',
    'kink-community','dating-connection','marriage-partnership','trans-health',
    'safer-sex','violence-hate','drag-performance','sports-recreation',
    'religion-belief','vibe-crowd','audiences');
  if v_collisions > 0 then
    raise exception 'taxonomy v3: % new slugs already exist in tag_categories', v_collisions;
  end if;
end $$;

do $$
declare
  v_actor_ok boolean;
  v_dup_primaries_before int;
  v_dup_primaries_after int;
  v_junction_tags_before int;
  v_junction_tags_after int;
begin
  -- Accountable actor for log_unified_tag_change (human_reviewed gate).
  perform set_config('app.actor', 'migration:20261006140000_tag_taxonomy_v3_tree', true);

  select count(*) into v_dup_primaries_before from (
    select tag_id from tag_category_assignments where is_primary
    group by tag_id having count(*) > 1) d;
  select count(distinct tag_id) into v_junction_tags_before from tag_category_assignments;

  -- ── 1. New L0 lines ────────────────────────────────────────────────────
  insert into tag_categories (name, slug, description, color, sort_order, parent_id, level) values
    ('Identity',              'identity',             'Orientation, gender, intersex, umbrella terms, expression', '#ec4899', 101, null, 0),
    ('Sex & Kink',            'sex-kink',             'Practices, dynamics, fetishes, gear and kink community — 18+', '#f43f5e', 102, null, 0),
    ('Relationships & Family','relationships-family', 'Dating, relationship structures, marriage, family and parenting', '#f97316', 103, null, 0),
    ('Health',                'health',               'Sexual, mental, trans and reproductive health; substances and recovery', '#14b8a6', 104, null, 0),
    ('Safety & Consent',      'safety-consent',       'Consent, safer sex, violence and hate, digital and travel safety', '#06b6d4', 105, null, 0),
    ('Culture & Community',   'culture-community',    'Slang, drag, subcultures, media, arts, symbols, sports', '#8b5cf6', 106, null, 0),
    ('History & Rights',      'history-rights',       'Movements, people, laws, politics, institutions, religion', '#3b82f6', 107, null, 0),
    ('Places & Scene',        'places-scene',         'What content is tagged with: venue types and features, vibes, audiences, events, stays, destinations', '#10b981', 108, null, 0);

  -- ── 2. New L1 stops ────────────────────────────────────────────────────
  insert into tag_categories (name, slug, description, color, sort_order, parent_id, level)
  select v.name, v.slug, v.description, v.color, v.sort_order, p.id, 1
  from (values
    ('Kink Community & Scenes', 'kink-community',      'Kink identities, archetypes and scene culture', '#f43f5e', 5, 'sex-kink'),
    ('Dating & Connection',     'dating-connection',   'Dating, courtship, flirting, intimacy', '#f97316', 1, 'relationships-family'),
    ('Marriage & Partnership',  'marriage-partnership','Marriage equality, weddings, civil unions, divorce', '#f97316', 3, 'relationships-family'),
    ('Trans Health & Gender-Affirming Care', 'trans-health', 'Gender-affirming care, transition, hormones', '#14b8a6', 3, 'health'),
    ('Safer Sex Practices',     'safer-sex',           'Barriers, testing, PEP/PrEP practice, negotiated safety', '#06b6d4', 2, 'safety-consent'),
    ('Violence & Hate',         'violence-hate',       'Hate crimes, hate speech, conversion practices, violence', '#06b6d4', 3, 'safety-consent'),
    ('Drag & Performance',      'drag-performance',    'Drag, ballroom performance, cabaret arts', '#8b5cf6', 2, 'culture-community'),
    ('Sports & Recreation',     'sports-recreation',   'Sport, teams, fitness culture, outdoor recreation', '#8b5cf6', 7, 'culture-community'),
    ('Religion & Belief',       'religion-belief',     'Faith, religious institutions and queer life', '#3b82f6', 6, 'history-rights'),
    ('Vibe & Crowd',            'vibe-crowd',          'Atmosphere and crowd descriptors content is tagged with', '#10b981', 3, 'places-scene'),
    ('Audiences',               'audiences',           'Who a place or event is for: youth, seniors, families', '#10b981', 4, 'places-scene')
  ) as v(name, slug, description, color, sort_order, parent_slug)
  join tag_categories p on p.slug = v.parent_slug and p.level = 0;

  -- ── 3. Re-parent + rename surviving stops ──────────────────────────────
  update tag_categories c set
    parent_id = p.id,
    name = m.new_name,
    sort_order = m.sort_order
  from (values
    -- Identity
    ('sexual-orientation',        'Orientation',                    'identity', 1),
    ('gender-identity',           'Gender',                         'identity', 2),
    ('intersex-bodies',           'Intersex & Bodies',              'identity', 3),
    ('questioning-labels',        'Umbrella Terms & Labels',        'identity', 4),
    ('expression-presentation',   'Expression & Style',             'identity', 5),
    -- Sex & Kink
    ('practices-play',            'Practices & Play',               'sex-kink', 1),
    ('bdsm-power-exchange',       'Dynamics & Roles',               'sex-kink', 2),
    ('fetishes-interests',        'Fetishes',                       'sex-kink', 3),
    ('gear-aesthetics',           'Gear',                           'sex-kink', 4),
    -- Relationships & Family
    ('relationship-structures',   'Relationship Structures',        'relationships-family', 2),
    ('family-chosen-family',      'Family & Parenting',             'relationships-family', 4),
    -- Health
    ('sexual-health',             'Sexual Health',                  'health', 1),
    ('mental-health',             'Mental Health',                  'health', 2),
    ('physical-reproductive',     'Body & Reproductive Health',     'health', 4),
    ('substances-harm-reduction', 'Substances & Recovery',          'health', 5),
    -- Safety & Consent
    ('consent-negotiation',       'Consent & Negotiation',          'safety-consent', 1),
    ('physical-digital-safety',   'Digital & Travel Safety',        'safety-consent', 4),
    -- Culture & Community
    ('slang-terminology',         'Slang & Language',               'culture-community', 1),
    ('subcultures',               'Subcultures & Scenes',           'culture-community', 3),
    ('media-film-music',          'Media & Entertainment',          'culture-community', 4),
    ('art-literature-zines',      'Arts & Literature',              'culture-community', 5),
    ('symbols-flags',             'Symbols & Flags',                'culture-community', 6),
    -- History & Rights
    ('movements-milestones',      'Movements & Milestones',         'history-rights', 1),
    ('figures-icons',             'People & Icons',                 'history-rights', 2),
    ('legal-rights',              'Laws & Legal Rights',            'history-rights', 3),
    ('political-activism',        'Politics & Activism',            'history-rights', 4),
    ('workplace-education-policy','Work, School & Institutions',    'history-rights', 5),
    -- Places & Scene
    ('venues-nightlife',          'Venue Types',                    'places-scene', 1),
    ('safe-spaces',               'Venue Features & Policies',      'places-scene', 2),
    ('events-scene',              'Events & Parties',               'places-scene', 5),
    ('accommodation',             'Stays',                          'places-scene', 6),
    ('travel-destinations',       'Destinations',                   'places-scene', 7),
    ('support-services',          'Community Life & Support',       'places-scene', 8)
  ) as m(slug, new_name, parent_slug, sort_order)
  join tag_categories p on p.slug = m.parent_slug and p.level = 0
  where c.slug = m.slug and c.level = 1;

  -- ── 4. Wholesale merges of non-surviving kink stops ────────────────────
  -- sexual-roles -> Dynamics & Roles; body-types-archetypes -> Kink
  -- Community & Scenes. Both sides are adult under BOTH recompute
  -- definitions, so is_adult cannot flip. INSERT..ON CONFLICT + DELETE (a
  -- plain UPDATE conflicts where a tag already holds a row on the target).
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select a.tag_id, t.id, a.is_primary
  from tag_category_assignments a
  join tag_categories s on s.id = a.category_id and s.slug = 'sexual-roles'
  join tag_categories t on t.slug = 'bdsm-power-exchange'
  on conflict (tag_id, category_id)
    do update set is_primary = tag_category_assignments.is_primary or excluded.is_primary;

  delete from tag_category_assignments a
  using tag_categories s
  where s.id = a.category_id and s.slug = 'sexual-roles';

  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select a.tag_id, t.id, a.is_primary
  from tag_category_assignments a
  join tag_categories s on s.id = a.category_id and s.slug = 'body-types-archetypes'
  join tag_categories t on t.slug = 'kink-community'
  on conflict (tag_id, category_id)
    do update set is_primary = tag_category_assignments.is_primary or excluded.is_primary;

  delete from tag_category_assignments a
  using tag_categories s
  where s.id = a.category_id and s.slug = 'body-types-archetypes';

  -- Repoint the denorm FK for tags that pointed at the merged stops.
  update unified_tags u set category_id = t.id
  from tag_categories s, tag_categories t
  where u.category_id = s.id and s.slug = 'sexual-roles' and t.slug = 'bdsm-power-exchange';
  update unified_tags u set category_id = t.id
  from tag_categories s, tag_categories t
  where u.category_id = s.id and s.slug = 'body-types-archetypes' and t.slug = 'kink-community';

  -- ── 5. Refresh the text mirror wherever a rename made it stale ─────────
  -- Setting `category` explicitly is ALSO what fires the column-scoped
  -- trg_search_documents_tag (enqueue-only since 20260816090100), so every
  -- renamed tag re-indexes with its new category facet.
  update unified_tags u set category = tc.name
  from tag_categories tc
  where u.category_id = tc.id and u.category is distinct from tc.name;

  -- ── Postconditions ─────────────────────────────────────────────────────
  select count(*) into v_dup_primaries_after from (
    select tag_id from tag_category_assignments where is_primary
    group by tag_id having count(*) > 1) d;
  if v_dup_primaries_after > v_dup_primaries_before then
    raise exception 'taxonomy v3: merges created duplicate primaries (% -> %)',
      v_dup_primaries_before, v_dup_primaries_after;
  end if;

  select count(distinct tag_id) into v_junction_tags_after from tag_category_assignments;
  if v_junction_tags_after <> v_junction_tags_before then
    raise exception 'taxonomy v3: filed-tag count changed (% -> %) — a merge dropped tags',
      v_junction_tags_before, v_junction_tags_after;
  end if;

  if (select count(*) from tag_categories where slug = 'sexual-roles' and exists (
        select 1 from tag_category_assignments a where a.category_id = tag_categories.id)) > 0
     or (select count(*) from tag_categories where slug = 'body-types-archetypes' and exists (
        select 1 from tag_category_assignments a where a.category_id = tag_categories.id)) > 0 then
    raise exception 'taxonomy v3: merged stops still hold assignments';
  end if;

  if (select count(*) from tag_categories where level = 0 and slug in (
      'identity','sex-kink','relationships-family','health','safety-consent',
      'culture-community','history-rights','places-scene')) <> 8 then
    raise exception 'taxonomy v3: expected 8 new roots';
  end if;

  -- Every new root has children (a childless line means a re-parent failed).
  if exists (
    select 1 from tag_categories p
    where p.level = 0 and p.slug in (
      'identity','sex-kink','relationships-family','health','safety-consent',
      'culture-community','history-rights','places-scene')
    and not exists (select 1 from tag_categories c where c.parent_id = p.id)) then
    raise exception 'taxonomy v3: a new root has no children';
  end if;
end $$;
