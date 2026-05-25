-- Follow-up to 20260524500000_optimize_rls_policies_perf.sql
-- Linter still flags auth.uid() inside helper args even when the whole call is in (SELECT ...).
-- Rewrite to wrap the inner arg: is_admin((SELECT auth.uid())) instead of (SELECT is_admin(auth.uid())).

-- trip_collections
DROP POLICY IF EXISTS trip_collections_select ON public.trip_collections;
DROP POLICY IF EXISTS trip_collections_admin_insert ON public.trip_collections;
DROP POLICY IF EXISTS trip_collections_admin_update ON public.trip_collections;
DROP POLICY IF EXISTS trip_collections_admin_delete ON public.trip_collections;
CREATE POLICY trip_collections_select ON public.trip_collections
  FOR SELECT TO public USING (is_active = true OR public.is_admin((SELECT auth.uid())));
CREATE POLICY trip_collections_admin_insert ON public.trip_collections
  FOR INSERT TO authenticated WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY trip_collections_admin_update ON public.trip_collections
  FOR UPDATE TO authenticated USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY trip_collections_admin_delete ON public.trip_collections
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- trip_collection_items
DROP POLICY IF EXISTS trip_collection_items_select ON public.trip_collection_items;
DROP POLICY IF EXISTS trip_collection_items_admin_insert ON public.trip_collection_items;
DROP POLICY IF EXISTS trip_collection_items_admin_update ON public.trip_collection_items;
DROP POLICY IF EXISTS trip_collection_items_admin_delete ON public.trip_collection_items;
CREATE POLICY trip_collection_items_select ON public.trip_collection_items
  FOR SELECT TO public USING (
    EXISTS (SELECT 1 FROM public.trip_collections c WHERE c.id = trip_collection_items.collection_id AND c.is_active = true)
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY trip_collection_items_admin_insert ON public.trip_collection_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY trip_collection_items_admin_update ON public.trip_collection_items
  FOR UPDATE TO authenticated USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY trip_collection_items_admin_delete ON public.trip_collection_items
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- quests
DROP POLICY IF EXISTS quests_select ON public.quests;
DROP POLICY IF EXISTS quests_admin_insert ON public.quests;
DROP POLICY IF EXISTS quests_admin_update ON public.quests;
DROP POLICY IF EXISTS quests_admin_delete ON public.quests;
CREATE POLICY quests_select ON public.quests
  FOR SELECT TO public USING (status <> 'draft' OR public.is_admin((SELECT auth.uid())));
CREATE POLICY quests_admin_insert ON public.quests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY quests_admin_update ON public.quests
  FOR UPDATE TO authenticated USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY quests_admin_delete ON public.quests
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- quest_contributions
DROP POLICY IF EXISTS quest_contributions_admin_insert ON public.quest_contributions;
DROP POLICY IF EXISTS quest_contributions_admin_update ON public.quest_contributions;
DROP POLICY IF EXISTS quest_contributions_admin_delete ON public.quest_contributions;
CREATE POLICY quest_contributions_admin_insert ON public.quest_contributions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY quest_contributions_admin_update ON public.quest_contributions
  FOR UPDATE TO authenticated USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY quest_contributions_admin_delete ON public.quest_contributions
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- canned_responses
DROP POLICY IF EXISTS canned_responses_admin_insert ON public.canned_responses;
DROP POLICY IF EXISTS canned_responses_admin_update ON public.canned_responses;
DROP POLICY IF EXISTS canned_responses_admin_delete ON public.canned_responses;
CREATE POLICY canned_responses_admin_insert ON public.canned_responses
  FOR INSERT TO public WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY canned_responses_admin_update ON public.canned_responses
  FOR UPDATE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY canned_responses_admin_delete ON public.canned_responses
  FOR DELETE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- editorial_drafts
DROP POLICY IF EXISTS editorial_drafts_admin_all ON public.editorial_drafts;
CREATE POLICY editorial_drafts_admin_all ON public.editorial_drafts
  FOR ALL TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));

-- editorial_rails
DROP POLICY IF EXISTS editorial_rails_select ON public.editorial_rails;
DROP POLICY IF EXISTS editorial_rails_admin_insert ON public.editorial_rails;
DROP POLICY IF EXISTS editorial_rails_admin_update ON public.editorial_rails;
DROP POLICY IF EXISTS editorial_rails_admin_delete ON public.editorial_rails;
CREATE POLICY editorial_rails_select ON public.editorial_rails
  FOR SELECT TO public USING (
    (status = 'published'::editorial_rail_status AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()))
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY editorial_rails_admin_insert ON public.editorial_rails
  FOR INSERT TO public WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_rails_admin_update ON public.editorial_rails
  FOR UPDATE TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_rails_admin_delete ON public.editorial_rails
  FOR DELETE TO public USING (public.is_admin((SELECT auth.uid())));

-- editorial_rail_items
DROP POLICY IF EXISTS editorial_rail_items_select ON public.editorial_rail_items;
DROP POLICY IF EXISTS editorial_rail_items_admin_insert ON public.editorial_rail_items;
DROP POLICY IF EXISTS editorial_rail_items_admin_update ON public.editorial_rail_items;
DROP POLICY IF EXISTS editorial_rail_items_admin_delete ON public.editorial_rail_items;
CREATE POLICY editorial_rail_items_select ON public.editorial_rail_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.editorial_rails r
      WHERE r.id = editorial_rail_items.rail_id
        AND r.status = 'published'::editorial_rail_status
        AND (r.starts_at IS NULL OR r.starts_at <= now())
        AND (r.ends_at IS NULL OR r.ends_at > now())
    )
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY editorial_rail_items_admin_insert ON public.editorial_rail_items
  FOR INSERT TO public WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_rail_items_admin_update ON public.editorial_rail_items
  FOR UPDATE TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_rail_items_admin_delete ON public.editorial_rail_items
  FOR DELETE TO public USING (public.is_admin((SELECT auth.uid())));

-- editorial_covers
DROP POLICY IF EXISTS editorial_covers_select ON public.editorial_covers;
DROP POLICY IF EXISTS editorial_covers_admin_insert ON public.editorial_covers;
DROP POLICY IF EXISTS editorial_covers_admin_update ON public.editorial_covers;
DROP POLICY IF EXISTS editorial_covers_admin_delete ON public.editorial_covers;
CREATE POLICY editorial_covers_select ON public.editorial_covers
  FOR SELECT TO public USING (
    (published = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()))
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY editorial_covers_admin_insert ON public.editorial_covers
  FOR INSERT TO public WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_covers_admin_update ON public.editorial_covers
  FOR UPDATE TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY editorial_covers_admin_delete ON public.editorial_covers
  FOR DELETE TO public USING (public.is_admin((SELECT auth.uid())));

-- marketplace_collections
DROP POLICY IF EXISTS marketplace_collections_select ON public.marketplace_collections;
DROP POLICY IF EXISTS marketplace_collections_admin_insert ON public.marketplace_collections;
DROP POLICY IF EXISTS marketplace_collections_admin_update ON public.marketplace_collections;
DROP POLICY IF EXISTS marketplace_collections_admin_delete ON public.marketplace_collections;
CREATE POLICY marketplace_collections_select ON public.marketplace_collections
  FOR SELECT TO public USING (
    status = 'published'::marketplace_collection_status OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY marketplace_collections_admin_insert ON public.marketplace_collections
  FOR INSERT TO public WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY marketplace_collections_admin_update ON public.marketplace_collections
  FOR UPDATE TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY marketplace_collections_admin_delete ON public.marketplace_collections
  FOR DELETE TO public USING (public.is_admin((SELECT auth.uid())));

-- marketplace_collection_items
DROP POLICY IF EXISTS marketplace_collection_items_select ON public.marketplace_collection_items;
DROP POLICY IF EXISTS marketplace_collection_items_admin_insert ON public.marketplace_collection_items;
DROP POLICY IF EXISTS marketplace_collection_items_admin_update ON public.marketplace_collection_items;
DROP POLICY IF EXISTS marketplace_collection_items_admin_delete ON public.marketplace_collection_items;
CREATE POLICY marketplace_collection_items_select ON public.marketplace_collection_items
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_collections c
      WHERE c.id = marketplace_collection_items.collection_id
        AND c.status = 'published'::marketplace_collection_status
    )
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY marketplace_collection_items_admin_insert ON public.marketplace_collection_items
  FOR INSERT TO public WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY marketplace_collection_items_admin_update ON public.marketplace_collection_items
  FOR UPDATE TO public USING (public.is_admin((SELECT auth.uid()))) WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY marketplace_collection_items_admin_delete ON public.marketplace_collection_items
  FOR DELETE TO public USING (public.is_admin((SELECT auth.uid())));

-- safety_signal_questions
DROP POLICY IF EXISTS safety_signal_questions_select ON public.safety_signal_questions;
DROP POLICY IF EXISTS safety_signal_questions_admin_insert ON public.safety_signal_questions;
DROP POLICY IF EXISTS safety_signal_questions_admin_update ON public.safety_signal_questions;
DROP POLICY IF EXISTS safety_signal_questions_admin_delete ON public.safety_signal_questions;
CREATE POLICY safety_signal_questions_select ON public.safety_signal_questions
  FOR SELECT TO public USING (active = true OR public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY safety_signal_questions_admin_insert ON public.safety_signal_questions
  FOR INSERT TO public WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY safety_signal_questions_admin_update ON public.safety_signal_questions
  FOR UPDATE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role)) WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY safety_signal_questions_admin_delete ON public.safety_signal_questions
  FOR DELETE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- venue_safety_signals
DROP POLICY IF EXISTS venue_safety_signals_select ON public.venue_safety_signals;
DROP POLICY IF EXISTS venue_safety_signals_admin_insert ON public.venue_safety_signals;
DROP POLICY IF EXISTS venue_safety_signals_admin_update ON public.venue_safety_signals;
DROP POLICY IF EXISTS venue_safety_signals_admin_delete ON public.venue_safety_signals;
CREATE POLICY venue_safety_signals_select ON public.venue_safety_signals
  FOR SELECT TO public USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY venue_safety_signals_admin_insert ON public.venue_safety_signals
  FOR INSERT TO public WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY venue_safety_signals_admin_update ON public.venue_safety_signals
  FOR UPDATE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role)) WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY venue_safety_signals_admin_delete ON public.venue_safety_signals
  FOR DELETE TO public USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));
