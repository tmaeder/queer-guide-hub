-- Supabase linter cleanup: search_path, materialized view exposure,
-- auth.uid() initplan, multiple permissive policies, missing FK indexes.
--
-- Skipped intentionally:
--   * SECURITY DEFINER warnings (case-by-case review; most are intentional public RPCs)
--   * auth_insufficient_mfa_options (dashboard config)
--   * unused_index INFO findings (drop separately when confirmed)
--   * non-public schema FKs (n8n, umami)

BEGIN;

------------------------------------------------------------
-- 1. function_search_path_mutable
------------------------------------------------------------
ALTER FUNCTION public.event_guides_default_review_due() SET search_path = '';
ALTER FUNCTION public.venue_guides_default_review_due() SET search_path = '';

------------------------------------------------------------
-- 2. materialized_view_in_api: hide leaderboards from API roles.
--    Keep them readable by service_role for internal use.
------------------------------------------------------------
REVOKE ALL ON public.venue_leaderboard_global FROM anon, authenticated;
REVOKE ALL ON public.venue_leaderboard_city   FROM anon, authenticated;

------------------------------------------------------------
-- 3. auth_rls_initplan: wrap auth.uid() in (select ...) so the
--    planner caches the value per query instead of per row.
------------------------------------------------------------

-- user_news_reads
DROP POLICY IF EXISTS user_news_reads_self_select ON public.user_news_reads;
CREATE POLICY user_news_reads_self_select ON public.user_news_reads
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_news_reads_self_insert ON public.user_news_reads;
CREATE POLICY user_news_reads_self_insert ON public.user_news_reads
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_news_reads_self_delete ON public.user_news_reads;
CREATE POLICY user_news_reads_self_delete ON public.user_news_reads
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- user_activity_events
DROP POLICY IF EXISTS user_activity_events_self_select ON public.user_activity_events;
CREATE POLICY user_activity_events_self_select ON public.user_activity_events
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- intimate_likes
DROP POLICY IF EXISTS intimate_likes_self_select ON public.intimate_likes;
CREATE POLICY intimate_likes_self_select ON public.intimate_likes
  FOR SELECT TO authenticated
  USING ((actor_id = (select auth.uid())) OR (target_id = (select auth.uid())));

DROP POLICY IF EXISTS intimate_likes_self_insert ON public.intimate_likes;
CREATE POLICY intimate_likes_self_insert ON public.intimate_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    (actor_id = (select auth.uid()))
    AND is_intimate_eligible((select auth.uid()))
    AND is_intimate_eligible(target_id)
    AND (NOT intimate_is_blocked(actor_id, target_id))
  );

DROP POLICY IF EXISTS intimate_likes_self_delete ON public.intimate_likes;
CREATE POLICY intimate_likes_self_delete ON public.intimate_likes
  FOR DELETE TO authenticated
  USING (actor_id = (select auth.uid()));

-- intimate_passes
DROP POLICY IF EXISTS intimate_passes_self_select ON public.intimate_passes;
CREATE POLICY intimate_passes_self_select ON public.intimate_passes
  FOR SELECT TO authenticated
  USING (actor_id = (select auth.uid()));

DROP POLICY IF EXISTS intimate_passes_self_insert ON public.intimate_passes;
CREATE POLICY intimate_passes_self_insert ON public.intimate_passes
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = (select auth.uid()));

DROP POLICY IF EXISTS intimate_passes_self_delete ON public.intimate_passes;
CREATE POLICY intimate_passes_self_delete ON public.intimate_passes
  FOR DELETE TO authenticated
  USING (actor_id = (select auth.uid()));

-- intimate_cruising_mode
DROP POLICY IF EXISTS intimate_cruising_mode_self_select ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_select ON public.intimate_cruising_mode
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS intimate_cruising_mode_self_insert ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_insert ON public.intimate_cruising_mode
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS intimate_cruising_mode_self_update ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_update ON public.intimate_cruising_mode
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- intimate_thread_consent
DROP POLICY IF EXISTS intimate_thread_consent_participant_select ON public.intimate_thread_consent;
CREATE POLICY intimate_thread_consent_participant_select ON public.intimate_thread_consent
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = intimate_thread_consent.conversation_id
      AND cp.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS intimate_thread_consent_participant_update ON public.intimate_thread_consent;
CREATE POLICY intimate_thread_consent_participant_update ON public.intimate_thread_consent
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = intimate_thread_consent.conversation_id
      AND cp.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = intimate_thread_consent.conversation_id
      AND cp.user_id = (select auth.uid())
  ));

-- group_chat_messages
DROP POLICY IF EXISTS group_chat_member_select ON public.group_chat_messages;
CREATE POLICY group_chat_member_select ON public.group_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_memberships m
    WHERE m.group_id = group_chat_messages.group_id
      AND m.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS group_chat_member_insert ON public.group_chat_messages;
CREATE POLICY group_chat_member_insert ON public.group_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = group_chat_messages.group_id
        AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS group_chat_self_update ON public.group_chat_messages;
CREATE POLICY group_chat_self_update ON public.group_chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid()))
  WITH CHECK (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS group_chat_author_or_mod_delete ON public.group_chat_messages;
CREATE POLICY group_chat_author_or_mod_delete ON public.group_chat_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = group_chat_messages.group_id
        AND m.user_id = (select auth.uid())
        AND m.role = ANY (ARRAY['admin','moderator'])
    )
  );

-- group_collections
DROP POLICY IF EXISTS group_collections_member_or_public_select ON public.group_collections;
CREATE POLICY group_collections_member_or_public_select ON public.group_collections
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.community_groups g
    WHERE g.id = group_collections.group_id
      AND (
        g.is_private = false
        OR EXISTS (
          SELECT 1 FROM public.group_memberships m
          WHERE m.group_id = g.id AND m.user_id = (select auth.uid())
        )
      )
  ));

DROP POLICY IF EXISTS group_collections_member_insert ON public.group_collections;
CREATE POLICY group_collections_member_insert ON public.group_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = group_collections.group_id
        AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS group_collections_creator_or_mod_update ON public.group_collections;
CREATE POLICY group_collections_creator_or_mod_update ON public.group_collections
  FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = group_collections.group_id
        AND m.user_id = (select auth.uid())
        AND m.role = ANY (ARRAY['admin','moderator'])
    )
  );

DROP POLICY IF EXISTS group_collections_creator_or_mod_delete ON public.group_collections;
CREATE POLICY group_collections_creator_or_mod_delete ON public.group_collections
  FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = group_collections.group_id
        AND m.user_id = (select auth.uid())
        AND m.role = ANY (ARRAY['admin','moderator'])
    )
  );

-- group_collection_items
DROP POLICY IF EXISTS group_collection_items_inherit_select ON public.group_collection_items;
CREATE POLICY group_collection_items_inherit_select ON public.group_collection_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.group_collections c
    JOIN public.community_groups g ON g.id = c.group_id
    WHERE c.id = group_collection_items.collection_id
      AND (
        g.is_private = false
        OR EXISTS (
          SELECT 1 FROM public.group_memberships m
          WHERE m.group_id = g.id AND m.user_id = (select auth.uid())
        )
      )
  ));

DROP POLICY IF EXISTS group_collection_items_member_insert ON public.group_collection_items;
CREATE POLICY group_collection_items_member_insert ON public.group_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.group_collections c
      JOIN public.group_memberships m ON m.group_id = c.group_id
      WHERE c.id = group_collection_items.collection_id
        AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS group_collection_items_adder_or_mod_delete ON public.group_collection_items;
CREATE POLICY group_collection_items_adder_or_mod_delete ON public.group_collection_items
  FOR DELETE TO authenticated
  USING (
    added_by = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.group_collections c
      JOIN public.group_memberships m ON m.group_id = c.group_id
      WHERE c.id = group_collection_items.collection_id
        AND m.user_id = (select auth.uid())
        AND m.role = ANY (ARRAY['admin','moderator'])
    )
  );

-- trip_group_links
DROP POLICY IF EXISTS trip_group_links_party_select ON public.trip_group_links;
CREATE POLICY trip_group_links_party_select ON public.trip_group_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_group_links.trip_id AND t.owner_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trip_group_links.trip_id AND tm.user_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.group_memberships m WHERE m.group_id = trip_group_links.group_id AND m.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS trip_group_links_owner_insert ON public.trip_group_links;
CREATE POLICY trip_group_links_owner_insert ON public.trip_group_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_group_links.trip_id AND t.owner_id = (select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.group_memberships m WHERE m.group_id = trip_group_links.group_id AND m.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS trip_group_links_owner_or_mod_delete ON public.trip_group_links;
CREATE POLICY trip_group_links_owner_or_mod_delete ON public.trip_group_links
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_group_links.trip_id AND t.owner_id = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
      WHERE m.group_id = trip_group_links.group_id
        AND m.user_id = (select auth.uid())
        AND m.role = ANY (ARRAY['admin','moderator'])
    )
  );

-- venue_guide_reads
DROP POLICY IF EXISTS venue_guide_reads_owner_select ON public.venue_guide_reads;
CREATE POLICY venue_guide_reads_owner_select ON public.venue_guide_reads
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS venue_guide_reads_owner_insert ON public.venue_guide_reads;
CREATE POLICY venue_guide_reads_owner_insert ON public.venue_guide_reads
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS venue_guide_reads_owner_update ON public.venue_guide_reads;
CREATE POLICY venue_guide_reads_owner_update ON public.venue_guide_reads
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS venue_guide_reads_owner_delete ON public.venue_guide_reads;
CREATE POLICY venue_guide_reads_owner_delete ON public.venue_guide_reads
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

------------------------------------------------------------
-- 4. multiple_permissive_policies: split `*_admin_all` (FOR ALL)
--    into separate I/U/D policies and fold the admin read into
--    the existing select_published policy so only one SELECT
--    policy fires per role.
------------------------------------------------------------

-- venue_guides
DROP POLICY IF EXISTS venue_guides_admin_all ON public.venue_guides;
DROP POLICY IF EXISTS venue_guides_select_published ON public.venue_guides;
CREATE POLICY venue_guides_select_published ON public.venue_guides
  FOR SELECT TO public
  USING (status = 'published' OR public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guides_admin_insert ON public.venue_guides
  FOR INSERT TO public
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guides_admin_update ON public.venue_guides
  FOR UPDATE TO public
  USING (public.has_role_jwt('admin'::public.app_role))
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guides_admin_delete ON public.venue_guides
  FOR DELETE TO public
  USING (public.has_role_jwt('admin'::public.app_role));

-- venue_guide_picks
DROP POLICY IF EXISTS venue_guide_picks_admin_all ON public.venue_guide_picks;
DROP POLICY IF EXISTS venue_guide_picks_select_published ON public.venue_guide_picks;
CREATE POLICY venue_guide_picks_select_published ON public.venue_guide_picks
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.venue_guides g WHERE g.id = venue_guide_picks.guide_id AND g.status = 'published')
    OR public.has_role_jwt('admin'::public.app_role)
  );
CREATE POLICY venue_guide_picks_admin_insert ON public.venue_guide_picks
  FOR INSERT TO public
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guide_picks_admin_update ON public.venue_guide_picks
  FOR UPDATE TO public
  USING (public.has_role_jwt('admin'::public.app_role))
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guide_picks_admin_delete ON public.venue_guide_picks
  FOR DELETE TO public
  USING (public.has_role_jwt('admin'::public.app_role));

-- venue_guide_sections
DROP POLICY IF EXISTS venue_guide_sections_admin_all ON public.venue_guide_sections;
DROP POLICY IF EXISTS venue_guide_sections_select_published ON public.venue_guide_sections;
CREATE POLICY venue_guide_sections_select_published ON public.venue_guide_sections
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.venue_guides g WHERE g.id = venue_guide_sections.guide_id AND g.status = 'published')
    OR public.has_role_jwt('admin'::public.app_role)
  );
CREATE POLICY venue_guide_sections_admin_insert ON public.venue_guide_sections
  FOR INSERT TO public
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guide_sections_admin_update ON public.venue_guide_sections
  FOR UPDATE TO public
  USING (public.has_role_jwt('admin'::public.app_role))
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY venue_guide_sections_admin_delete ON public.venue_guide_sections
  FOR DELETE TO public
  USING (public.has_role_jwt('admin'::public.app_role));

-- event_guides
DROP POLICY IF EXISTS event_guides_admin_all ON public.event_guides;
DROP POLICY IF EXISTS event_guides_select_published ON public.event_guides;
CREATE POLICY event_guides_select_published ON public.event_guides
  FOR SELECT TO public
  USING (status = 'published' OR public.has_role_jwt('admin'::public.app_role));
CREATE POLICY event_guides_admin_insert ON public.event_guides
  FOR INSERT TO public
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY event_guides_admin_update ON public.event_guides
  FOR UPDATE TO public
  USING (public.has_role_jwt('admin'::public.app_role))
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY event_guides_admin_delete ON public.event_guides
  FOR DELETE TO public
  USING (public.has_role_jwt('admin'::public.app_role));

-- event_guide_picks
DROP POLICY IF EXISTS event_guide_picks_admin_all ON public.event_guide_picks;
DROP POLICY IF EXISTS event_guide_picks_select_published ON public.event_guide_picks;
CREATE POLICY event_guide_picks_select_published ON public.event_guide_picks
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.event_guides g WHERE g.id = event_guide_picks.guide_id AND g.status = 'published')
    OR public.has_role_jwt('admin'::public.app_role)
  );
CREATE POLICY event_guide_picks_admin_insert ON public.event_guide_picks
  FOR INSERT TO public
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY event_guide_picks_admin_update ON public.event_guide_picks
  FOR UPDATE TO public
  USING (public.has_role_jwt('admin'::public.app_role))
  WITH CHECK (public.has_role_jwt('admin'::public.app_role));
CREATE POLICY event_guide_picks_admin_delete ON public.event_guide_picks
  FOR DELETE TO public
  USING (public.has_role_jwt('admin'::public.app_role));

-- cms_pages_translations: consolidate the two SELECT policies into one.
DROP POLICY IF EXISTS "Editors read all page translations" ON public.cms_pages_translations;
DROP POLICY IF EXISTS "Public read published page translations" ON public.cms_pages_translations;
CREATE POLICY "Read page translations" ON public.cms_pages_translations
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cms_pages p
      WHERE p.id = cms_pages_translations.page_id
        AND p.workflow_state = 'published'::public.cms_workflow_state
        AND p.visibility_level = 'public'::public.cms_visibility_level
    )
    OR public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role])
  );

-- regions: drop the redundant authenticated-only SELECT.
DROP POLICY IF EXISTS "Regions are viewable by authenticated users" ON public.regions;

------------------------------------------------------------
-- 5. unindexed_foreign_keys (public schema only)
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_event_guides_author_id            ON public.event_guides (author_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_reply_to_id   ON public.group_chat_messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_group_collection_items_added_by   ON public.group_collection_items (added_by);
CREATE INDEX IF NOT EXISTS idx_group_collections_created_by      ON public.group_collections (created_by);
CREATE INDEX IF NOT EXISTS idx_intimate_cruising_mode_city_id    ON public.intimate_cruising_mode (city_id);
CREATE INDEX IF NOT EXISTS idx_intimate_passes_target_id         ON public.intimate_passes (target_id);
CREATE INDEX IF NOT EXISTS idx_intimate_thread_consent_ended_by  ON public.intimate_thread_consent (ended_by);
CREATE INDEX IF NOT EXISTS idx_news_challenges_created_by        ON public.news_challenges (created_by);
CREATE INDEX IF NOT EXISTS idx_trip_group_links_created_by       ON public.trip_group_links (created_by);
CREATE INDEX IF NOT EXISTS idx_user_news_reads_article_id        ON public.user_news_reads (article_id);
CREATE INDEX IF NOT EXISTS idx_venue_guide_reads_guide_id        ON public.venue_guide_reads (guide_id);
CREATE INDEX IF NOT EXISTS idx_venue_guides_author_id            ON public.venue_guides (author_id);

COMMIT;
