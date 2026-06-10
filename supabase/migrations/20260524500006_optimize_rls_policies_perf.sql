-- Optimize RLS for Supabase performance lints:
--   * auth_rls_initplan (0003): wrap auth.<fn>() in (SELECT ...) so it's evaluated once per query.
--   * multiple_permissive_policies (0006): collapse overlapping SELECT policies into one per (table,role).
--     For tables with an admin ALL policy + a public/owner SELECT policy, split the ALL into
--     per-command (INSERT/UPDATE/DELETE) so SELECT has a single permissive policy.

-- ---------------------------------------------------------------------------
-- trip_saves
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trip_saves_self_select ON public.trip_saves;
DROP POLICY IF EXISTS trip_saves_self_insert ON public.trip_saves;
DROP POLICY IF EXISTS trip_saves_self_delete ON public.trip_saves;

CREATE POLICY trip_saves_self_select ON public.trip_saves
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY trip_saves_self_insert ON public.trip_saves
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.trips t WHERE t.id = trip_saves.trip_id AND t.is_public = true
    )
  );
CREATE POLICY trip_saves_self_delete ON public.trip_saves
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- intimate_profiles  (consolidate mutual_read + self_read + self_write[ALL] SELECT)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS intimate_profiles_self_read ON public.intimate_profiles;
DROP POLICY IF EXISTS intimate_profiles_mutual_read ON public.intimate_profiles;
DROP POLICY IF EXISTS intimate_profiles_self_write ON public.intimate_profiles;

CREATE POLICY intimate_profiles_read ON public.intimate_profiles
  FOR SELECT TO public USING (
    id = (SELECT auth.uid())
    OR (
      id <> (SELECT auth.uid())
      AND opted_in_at IS NOT NULL
      AND moderation_status = 'approved'
      AND (SELECT public.is_intimate_eligible(auth.uid()))
      AND NOT (SELECT public.intimate_is_blocked(intimate_profiles.id, auth.uid()))
    )
  );
CREATE POLICY intimate_profiles_self_insert ON public.intimate_profiles
  FOR INSERT TO public WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY intimate_profiles_self_update ON public.intimate_profiles
  FOR UPDATE TO public USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY intimate_profiles_self_delete ON public.intimate_profiles
  FOR DELETE TO public USING (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- intimate_reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS intimate_reports_insert ON public.intimate_reports;
DROP POLICY IF EXISTS intimate_reports_self_read ON public.intimate_reports;

CREATE POLICY intimate_reports_insert ON public.intimate_reports
  FOR INSERT TO public WITH CHECK (reporter_id = (SELECT auth.uid()));
CREATE POLICY intimate_reports_self_read ON public.intimate_reports
  FOR SELECT TO public USING (reporter_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- event_occurrences (consolidate admin_read + public_read)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS event_occurrences_admin_read ON public.event_occurrences;
DROP POLICY IF EXISTS event_occurrences_public_read ON public.event_occurrences;

CREATE POLICY event_occurrences_read ON public.event_occurrences
  FOR SELECT TO public USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_occurrences.master_event_id AND e.status = 'published'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ---------------------------------------------------------------------------
-- ai_suggestions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ai_suggestions_admin_read ON public.ai_suggestions;
CREATE POLICY ai_suggestions_admin_read ON public.ai_suggestions
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ---------------------------------------------------------------------------
-- user_footprint_share_prefs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS share_prefs_insert_own ON public.user_footprint_share_prefs;
DROP POLICY IF EXISTS share_prefs_update_own ON public.user_footprint_share_prefs;
DROP POLICY IF EXISTS share_prefs_delete_own ON public.user_footprint_share_prefs;

CREATE POLICY share_prefs_insert_own ON public.user_footprint_share_prefs
  FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY share_prefs_update_own ON public.user_footprint_share_prefs
  FOR UPDATE TO public USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY share_prefs_delete_own ON public.user_footprint_share_prefs
  FOR DELETE TO public USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- user_trust_events / user_trust_tiers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trust_events_owner_read ON public.user_trust_events;
CREATE POLICY trust_events_owner_read ON public.user_trust_events
  FOR SELECT TO public USING (
    (SELECT auth.uid()) = user_id OR (SELECT public.has_role_jwt('admin'::app_role))
  );

DROP POLICY IF EXISTS trust_tiers_owner_read ON public.user_trust_tiers;
CREATE POLICY trust_tiers_owner_read ON public.user_trust_tiers
  FOR SELECT TO public USING (
    (SELECT auth.uid()) = user_id OR (SELECT public.has_role_jwt('admin'::app_role))
  );

-- ---------------------------------------------------------------------------
-- user_endorsements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS endorsements_insert_self ON public.user_endorsements;
DROP POLICY IF EXISTS endorsements_read_involved ON public.user_endorsements;

CREATE POLICY endorsements_insert_self ON public.user_endorsements
  FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = endorser_id);
CREATE POLICY endorsements_read_involved ON public.user_endorsements
  FOR SELECT TO public USING (
    (SELECT auth.uid()) = endorser_id
    OR (SELECT auth.uid()) = endorsee_id
    OR (SELECT public.has_role_jwt('admin'::app_role))
  );

-- ---------------------------------------------------------------------------
-- venue_personal_visits
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS visits_owner_read ON public.venue_personal_visits;
DROP POLICY IF EXISTS visits_scout_write ON public.venue_personal_visits;
DROP POLICY IF EXISTS visits_owner_delete ON public.venue_personal_visits;

CREATE POLICY visits_owner_read ON public.venue_personal_visits
  FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);
CREATE POLICY visits_scout_write ON public.venue_personal_visits
  FOR INSERT TO public WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_tier(auth.uid(), 'scout'::text))
  );
CREATE POLICY visits_owner_delete ON public.venue_personal_visits
  FOR DELETE TO public USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- editorial_drafts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS editorial_drafts_admin_all ON public.editorial_drafts;
CREATE POLICY editorial_drafts_admin_all ON public.editorial_drafts
  FOR ALL TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- user_gamification (gamification_public_select is `true` for anon+authenticated; self is redundant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS gamification_self_select ON public.user_gamification;

-- ---------------------------------------------------------------------------
-- user_achievements (same: public_select is `true`; self_select redundant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_achievements_self_select ON public.user_achievements;

-- ---------------------------------------------------------------------------
-- user_place_marks (consolidate select_own + select_public; wrap others)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS place_marks_select_own ON public.user_place_marks;
DROP POLICY IF EXISTS place_marks_select_public ON public.user_place_marks;
DROP POLICY IF EXISTS place_marks_insert_own ON public.user_place_marks;
DROP POLICY IF EXISTS place_marks_update_own ON public.user_place_marks;
DROP POLICY IF EXISTS place_marks_delete_own ON public.user_place_marks;

CREATE POLICY place_marks_select ON public.user_place_marks
  FOR SELECT TO public USING (
    is_public = true OR (SELECT auth.uid()) = user_id
  );
CREATE POLICY place_marks_insert_own ON public.user_place_marks
  FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY place_marks_update_own ON public.user_place_marks
  FOR UPDATE TO public USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY place_marks_delete_own ON public.user_place_marks
  FOR DELETE TO public USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- group_memberships
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Group memberships read access" ON public.group_memberships;
DROP POLICY IF EXISTS "Group memberships insert" ON public.group_memberships;
DROP POLICY IF EXISTS "Group memberships update" ON public.group_memberships;
DROP POLICY IF EXISTS "Group memberships delete" ON public.group_memberships;

CREATE POLICY "Group memberships read access" ON public.group_memberships
  FOR SELECT TO public USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.community_groups cg
      WHERE cg.id = group_memberships.group_id AND cg.created_by = (SELECT auth.uid())
    )
    OR (SELECT public.is_group_admin_or_mod(group_memberships.group_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.community_groups cg
      WHERE cg.id = group_memberships.group_id AND cg.is_private = false
    )
  );
CREATE POLICY "Group memberships insert" ON public.group_memberships
  FOR INSERT TO public WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.community_groups cg
      WHERE cg.id = group_memberships.group_id AND cg.created_by = (SELECT auth.uid())
    )
    OR (SELECT public.is_group_admin_or_mod(group_memberships.group_id, auth.uid()))
  );
CREATE POLICY "Group memberships update" ON public.group_memberships
  FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM public.community_groups cg
      WHERE cg.id = group_memberships.group_id AND cg.created_by = (SELECT auth.uid())
    )
    OR (SELECT public.is_group_admin_or_mod(group_memberships.group_id, auth.uid()))
  );
CREATE POLICY "Group memberships delete" ON public.group_memberships
  FOR DELETE TO public USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.community_groups cg
      WHERE cg.id = group_memberships.group_id AND cg.created_by = (SELECT auth.uid())
    )
    OR (SELECT public.is_group_admin_or_mod(group_memberships.group_id, auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- trip_collections / trip_collection_items (split admin ALL into per-cmd + merge SELECT)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trip_collections_admin_write ON public.trip_collections;
DROP POLICY IF EXISTS trip_collections_public_read ON public.trip_collections;

CREATE POLICY trip_collections_select ON public.trip_collections
  FOR SELECT TO public USING (
    is_active = true OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY trip_collections_admin_insert ON public.trip_collections
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY trip_collections_admin_update ON public.trip_collections
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY trip_collections_admin_delete ON public.trip_collections
  FOR DELETE TO authenticated USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS trip_collection_items_admin_write ON public.trip_collection_items;
DROP POLICY IF EXISTS trip_collection_items_public_read ON public.trip_collection_items;

CREATE POLICY trip_collection_items_select ON public.trip_collection_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.trip_collections c
      WHERE c.id = trip_collection_items.collection_id AND c.is_active = true
    )
    OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY trip_collection_items_admin_insert ON public.trip_collection_items
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY trip_collection_items_admin_update ON public.trip_collection_items
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY trip_collection_items_admin_delete ON public.trip_collection_items
  FOR DELETE TO authenticated USING ((SELECT public.is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- quests / quest_participations / quest_contributions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quests_admin_all ON public.quests;
DROP POLICY IF EXISTS quests_read ON public.quests;

CREATE POLICY quests_select ON public.quests
  FOR SELECT TO public USING (
    status <> 'draft' OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY quests_admin_insert ON public.quests
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY quests_admin_update ON public.quests
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY quests_admin_delete ON public.quests
  FOR DELETE TO authenticated USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS quest_participations_read_own ON public.quest_participations;
DROP POLICY IF EXISTS quest_participations_read_public ON public.quest_participations;
DROP POLICY IF EXISTS quest_participations_insert_own ON public.quest_participations;
DROP POLICY IF EXISTS quest_participations_update_own ON public.quest_participations;
DROP POLICY IF EXISTS quest_participations_delete_own ON public.quest_participations;

CREATE POLICY quest_participations_select ON public.quest_participations
  FOR SELECT TO public USING (
    opted_in_public = true OR user_id = (SELECT auth.uid())
  );
CREATE POLICY quest_participations_insert_own ON public.quest_participations
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY quest_participations_update_own ON public.quest_participations
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY quest_participations_delete_own ON public.quest_participations
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS quest_contributions_admin_write ON public.quest_contributions;
DROP POLICY IF EXISTS quest_contributions_read ON public.quest_contributions;

CREATE POLICY quest_contributions_read ON public.quest_contributions
  FOR SELECT TO public USING (true);
CREATE POLICY quest_contributions_admin_insert ON public.quest_contributions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY quest_contributions_admin_update ON public.quest_contributions
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY quest_contributions_admin_delete ON public.quest_contributions
  FOR DELETE TO authenticated USING ((SELECT public.is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- contributor_mailing_addresses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS contributor_mailing_addresses_owner_select ON public.contributor_mailing_addresses;
DROP POLICY IF EXISTS contributor_mailing_addresses_admin_select ON public.contributor_mailing_addresses;
DROP POLICY IF EXISTS contributor_mailing_addresses_owner_upsert ON public.contributor_mailing_addresses;
DROP POLICY IF EXISTS contributor_mailing_addresses_owner_update ON public.contributor_mailing_addresses;
DROP POLICY IF EXISTS contributor_mailing_addresses_owner_delete ON public.contributor_mailing_addresses;

CREATE POLICY contributor_mailing_addresses_select ON public.contributor_mailing_addresses
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) OR (SELECT public.has_role_jwt('admin'::app_role))
  );
CREATE POLICY contributor_mailing_addresses_owner_upsert ON public.contributor_mailing_addresses
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY contributor_mailing_addresses_owner_update ON public.contributor_mailing_addresses
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY contributor_mailing_addresses_owner_delete ON public.contributor_mailing_addresses
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- wishlists / wishlist_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS wishlists_owner_all ON public.wishlists;
DROP POLICY IF EXISTS wishlists_public_read ON public.wishlists;

CREATE POLICY wishlists_select ON public.wishlists
  FOR SELECT TO public USING (
    visibility = 'public'::wishlist_visibility OR (SELECT auth.uid()) = user_id
  );
CREATE POLICY wishlists_owner_insert ON public.wishlists
  FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY wishlists_owner_update ON public.wishlists
  FOR UPDATE TO public USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY wishlists_owner_delete ON public.wishlists
  FOR DELETE TO public USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wishlist_items_owner_all ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_public_read ON public.wishlist_items;

CREATE POLICY wishlist_items_select ON public.wishlist_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (w.visibility = 'public'::wishlist_visibility OR w.user_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY wishlist_items_owner_insert ON public.wishlist_items
  FOR INSERT TO public WITH CHECK (
    EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_items.wishlist_id AND w.user_id = (SELECT auth.uid()))
  );
CREATE POLICY wishlist_items_owner_update ON public.wishlist_items
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_items.wishlist_id AND w.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_items.wishlist_id AND w.user_id = (SELECT auth.uid())));
CREATE POLICY wishlist_items_owner_delete ON public.wishlist_items
  FOR DELETE TO public USING (
    EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_items.wishlist_id AND w.user_id = (SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- marketplace_collections / marketplace_collection_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS marketplace_collections_admin_write ON public.marketplace_collections;
DROP POLICY IF EXISTS marketplace_collections_public_read ON public.marketplace_collections;

CREATE POLICY marketplace_collections_select ON public.marketplace_collections
  FOR SELECT TO public USING (
    status = 'published'::marketplace_collection_status OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY marketplace_collections_admin_insert ON public.marketplace_collections
  FOR INSERT TO public WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY marketplace_collections_admin_update ON public.marketplace_collections
  FOR UPDATE TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY marketplace_collections_admin_delete ON public.marketplace_collections
  FOR DELETE TO public USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS marketplace_collection_items_admin_write ON public.marketplace_collection_items;
DROP POLICY IF EXISTS marketplace_collection_items_public_read ON public.marketplace_collection_items;

CREATE POLICY marketplace_collection_items_select ON public.marketplace_collection_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_collections c
      WHERE c.id = marketplace_collection_items.collection_id
        AND c.status = 'published'::marketplace_collection_status
    )
    OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY marketplace_collection_items_admin_insert ON public.marketplace_collection_items
  FOR INSERT TO public WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY marketplace_collection_items_admin_update ON public.marketplace_collection_items
  FOR UPDATE TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY marketplace_collection_items_admin_delete ON public.marketplace_collection_items
  FOR DELETE TO public USING ((SELECT public.is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- search_reindex_jobs / search_audit_log / search_settings_versions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reindex_jobs_admin_read ON public.search_reindex_jobs;
CREATE POLICY reindex_jobs_admin_read ON public.search_reindex_jobs
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

DROP POLICY IF EXISTS audit_admin_read ON public.search_audit_log;
CREATE POLICY audit_admin_read ON public.search_audit_log
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::app_role
    )
  );

DROP POLICY IF EXISTS settings_versions_admin_read ON public.search_settings_versions;
CREATE POLICY settings_versions_admin_read ON public.search_settings_versions
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'::app_role
    )
  );

-- ---------------------------------------------------------------------------
-- topic_clusters / topic_cluster_tags (consolidate admin + public SELECT)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS topic_clusters_admin_read ON public.topic_clusters;
DROP POLICY IF EXISTS topic_clusters_public_read ON public.topic_clusters;
CREATE POLICY topic_clusters_select ON public.topic_clusters
  FOR SELECT TO public USING (
    status = 'active'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

DROP POLICY IF EXISTS topic_cluster_tags_admin_read ON public.topic_cluster_tags;
DROP POLICY IF EXISTS topic_cluster_tags_public_read ON public.topic_cluster_tags;
CREATE POLICY topic_cluster_tags_select ON public.topic_cluster_tags
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.topic_clusters tc
      WHERE tc.id = topic_cluster_tags.cluster_id AND tc.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ---------------------------------------------------------------------------
-- hotline_reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hotline_reports_admin_select ON public.hotline_reports;
CREATE POLICY hotline_reports_admin_select ON public.hotline_reports
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

DROP POLICY IF EXISTS hotline_reports_admin_update ON public.hotline_reports;
CREATE POLICY hotline_reports_admin_update ON public.hotline_reports
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ---------------------------------------------------------------------------
-- editorial_rails / editorial_rail_items / editorial_covers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS editorial_rails_admin_all ON public.editorial_rails;
DROP POLICY IF EXISTS editorial_rails_public_read_published ON public.editorial_rails;

CREATE POLICY editorial_rails_select ON public.editorial_rails
  FOR SELECT TO public USING (
    (
      status = 'published'::editorial_rail_status
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())
    )
    OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY editorial_rails_admin_insert ON public.editorial_rails
  FOR INSERT TO public WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_rails_admin_update ON public.editorial_rails
  FOR UPDATE TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_rails_admin_delete ON public.editorial_rails
  FOR DELETE TO public USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS editorial_rail_items_admin_all ON public.editorial_rail_items;
DROP POLICY IF EXISTS editorial_rail_items_public_read_published ON public.editorial_rail_items;

CREATE POLICY editorial_rail_items_select ON public.editorial_rail_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.editorial_rails r
      WHERE r.id = editorial_rail_items.rail_id
        AND r.status = 'published'::editorial_rail_status
        AND (r.starts_at IS NULL OR r.starts_at <= now())
        AND (r.ends_at IS NULL OR r.ends_at > now())
    )
    OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY editorial_rail_items_admin_insert ON public.editorial_rail_items
  FOR INSERT TO public WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_rail_items_admin_update ON public.editorial_rail_items
  FOR UPDATE TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_rail_items_admin_delete ON public.editorial_rail_items
  FOR DELETE TO public USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS editorial_covers_admin_all ON public.editorial_covers;
DROP POLICY IF EXISTS editorial_covers_public_read_published ON public.editorial_covers;

CREATE POLICY editorial_covers_select ON public.editorial_covers
  FOR SELECT TO public USING (
    (
      published = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now())
    )
    OR (SELECT public.is_admin(auth.uid()))
  );
CREATE POLICY editorial_covers_admin_insert ON public.editorial_covers
  FOR INSERT TO public WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_covers_admin_update ON public.editorial_covers
  FOR UPDATE TO public
  USING ((SELECT public.is_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE POLICY editorial_covers_admin_delete ON public.editorial_covers
  FOR DELETE TO public USING ((SELECT public.is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- marketplace_guide_reads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS marketplace_guide_reads_owner_select ON public.marketplace_guide_reads;
DROP POLICY IF EXISTS marketplace_guide_reads_owner_insert ON public.marketplace_guide_reads;
DROP POLICY IF EXISTS marketplace_guide_reads_owner_update ON public.marketplace_guide_reads;
DROP POLICY IF EXISTS marketplace_guide_reads_owner_delete ON public.marketplace_guide_reads;

CREATE POLICY marketplace_guide_reads_owner_select ON public.marketplace_guide_reads
  FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);
CREATE POLICY marketplace_guide_reads_owner_insert ON public.marketplace_guide_reads
  FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY marketplace_guide_reads_owner_update ON public.marketplace_guide_reads
  FOR UPDATE TO public USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY marketplace_guide_reads_owner_delete ON public.marketplace_guide_reads
  FOR DELETE TO public USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- admin_automations: admin_write (ALL, admin) + select (SELECT, admin+mod)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_automations_admin_write ON public.admin_automations;
DROP POLICY IF EXISTS admin_automations_select ON public.admin_automations;

CREATE POLICY admin_automations_select ON public.admin_automations
  FOR SELECT TO public USING (
    (SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  );
CREATE POLICY admin_automations_admin_insert ON public.admin_automations
  FOR INSERT TO public WITH CHECK ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY admin_automations_admin_update ON public.admin_automations
  FOR UPDATE TO public
  USING ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role])))
  WITH CHECK ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY admin_automations_admin_delete ON public.admin_automations
  FOR DELETE TO public USING ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role])));

-- ---------------------------------------------------------------------------
-- canned_responses: admin_all + select (true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS canned_responses_admin_all ON public.canned_responses;
DROP POLICY IF EXISTS canned_responses_select ON public.canned_responses;

CREATE POLICY canned_responses_select ON public.canned_responses
  FOR SELECT TO public USING (true);
CREATE POLICY canned_responses_admin_insert ON public.canned_responses
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY canned_responses_admin_update ON public.canned_responses
  FOR UPDATE TO public USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY canned_responses_admin_delete ON public.canned_responses
  FOR DELETE TO public USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- contributor_recognitions: admin_all + public_read
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS contributor_recognitions_admin_all ON public.contributor_recognitions;
DROP POLICY IF EXISTS contributor_recognitions_public_read ON public.contributor_recognitions;

CREATE POLICY contributor_recognitions_select ON public.contributor_recognitions
  FOR SELECT TO public USING (
    opted_in = true
    OR (SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  );
CREATE POLICY contributor_recognitions_admin_insert ON public.contributor_recognitions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY contributor_recognitions_admin_update ON public.contributor_recognitions
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))
  WITH CHECK ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY contributor_recognitions_admin_delete ON public.contributor_recognitions
  FOR DELETE TO authenticated USING ((SELECT public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- ---------------------------------------------------------------------------
-- fx_rates / marketplace_price_history: duplicate `true` SELECT policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS fx_rates_select ON public.fx_rates;
DROP POLICY IF EXISTS marketplace_price_history_select ON public.marketplace_price_history;

-- ---------------------------------------------------------------------------
-- image_assets / image_asset_links
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS image_assets_admin_read ON public.image_assets;
DROP POLICY IF EXISTS image_assets_public_read ON public.image_assets;
CREATE POLICY image_assets_select ON public.image_assets
  FOR SELECT TO public USING (
    status = 'active'
    OR (SELECT public.has_role_jwt('admin'::app_role))
    OR (SELECT public.has_role_jwt('moderator'::app_role))
  );

DROP POLICY IF EXISTS image_asset_links_admin_read ON public.image_asset_links;
DROP POLICY IF EXISTS image_asset_links_public_read ON public.image_asset_links;
CREATE POLICY image_asset_links_select ON public.image_asset_links
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.image_assets a
      WHERE a.id = image_asset_links.asset_id AND a.status = 'active'
    )
    OR (SELECT public.has_role_jwt('admin'::app_role))
    OR (SELECT public.has_role_jwt('moderator'::app_role))
  );

-- ---------------------------------------------------------------------------
-- marketplace_guides / marketplace_guide_picks / marketplace_guide_sections
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS marketplace_guides_admin_all ON public.marketplace_guides;
DROP POLICY IF EXISTS marketplace_guides_select_published ON public.marketplace_guides;
CREATE POLICY marketplace_guides_select ON public.marketplace_guides
  FOR SELECT TO public USING (
    status = 'published' OR (SELECT public.has_role_jwt('admin'::app_role))
  );
CREATE POLICY marketplace_guides_admin_insert ON public.marketplace_guides
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guides_admin_update ON public.marketplace_guides
  FOR UPDATE TO public
  USING ((SELECT public.has_role_jwt('admin'::app_role)))
  WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guides_admin_delete ON public.marketplace_guides
  FOR DELETE TO public USING ((SELECT public.has_role_jwt('admin'::app_role)));

DROP POLICY IF EXISTS marketplace_guide_picks_admin_all ON public.marketplace_guide_picks;
DROP POLICY IF EXISTS marketplace_guide_picks_select_published ON public.marketplace_guide_picks;
CREATE POLICY marketplace_guide_picks_select ON public.marketplace_guide_picks
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_guides g
      WHERE g.id = marketplace_guide_picks.guide_id AND g.status = 'published'
    )
    OR (SELECT public.has_role_jwt('admin'::app_role))
  );
CREATE POLICY marketplace_guide_picks_admin_insert ON public.marketplace_guide_picks
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guide_picks_admin_update ON public.marketplace_guide_picks
  FOR UPDATE TO public
  USING ((SELECT public.has_role_jwt('admin'::app_role)))
  WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guide_picks_admin_delete ON public.marketplace_guide_picks
  FOR DELETE TO public USING ((SELECT public.has_role_jwt('admin'::app_role)));

DROP POLICY IF EXISTS marketplace_guide_sections_admin_all ON public.marketplace_guide_sections;
DROP POLICY IF EXISTS marketplace_guide_sections_select_published ON public.marketplace_guide_sections;
CREATE POLICY marketplace_guide_sections_select ON public.marketplace_guide_sections
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_guides g
      WHERE g.id = marketplace_guide_sections.guide_id AND g.status = 'published'
    )
    OR (SELECT public.has_role_jwt('admin'::app_role))
  );
CREATE POLICY marketplace_guide_sections_admin_insert ON public.marketplace_guide_sections
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guide_sections_admin_update ON public.marketplace_guide_sections
  FOR UPDATE TO public
  USING ((SELECT public.has_role_jwt('admin'::app_role)))
  WITH CHECK ((SELECT public.has_role_jwt('admin'::app_role)));
CREATE POLICY marketplace_guide_sections_admin_delete ON public.marketplace_guide_sections
  FOR DELETE TO public USING ((SELECT public.has_role_jwt('admin'::app_role)));

-- ---------------------------------------------------------------------------
-- safety_signal_questions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS safety_signal_questions_admin_all ON public.safety_signal_questions;
DROP POLICY IF EXISTS safety_signal_questions_public_select ON public.safety_signal_questions;

CREATE POLICY safety_signal_questions_select ON public.safety_signal_questions
  FOR SELECT TO public USING (
    active = true OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY safety_signal_questions_admin_insert ON public.safety_signal_questions
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY safety_signal_questions_admin_update ON public.safety_signal_questions
  FOR UPDATE TO public
  USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY safety_signal_questions_admin_delete ON public.safety_signal_questions
  FOR DELETE TO public USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- venue_safety_signals (admin_all + owner_select)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS venue_safety_signals_admin_all ON public.venue_safety_signals;
DROP POLICY IF EXISTS venue_safety_signals_owner_select ON public.venue_safety_signals;

CREATE POLICY venue_safety_signals_select ON public.venue_safety_signals
  FOR SELECT TO public USING (
    user_id = (SELECT auth.uid()) OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY venue_safety_signals_admin_insert ON public.venue_safety_signals
  FOR INSERT TO public WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY venue_safety_signals_admin_update ON public.venue_safety_signals
  FOR UPDATE TO public
  USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY venue_safety_signals_admin_delete ON public.venue_safety_signals
  FOR DELETE TO public USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- profiles (read_access already covers owner SELECT; drop redundant select_own)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
