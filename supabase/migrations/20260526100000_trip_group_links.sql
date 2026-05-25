-- Followup to milestone — trip ↔ group bidirectional linking.
--
-- Many-to-many between trips and community_groups. The trip owner can link
-- their trip to any group they're a member of; either trip members or group
-- members can read the link (a trip linked to a group becomes visible in
-- the group's hub, even for group members who aren't trip collaborators).
--
-- This is intentionally light: no notification fanout on link, no
-- automatic itinerary import. It's a discovery surface, not a sharing one.

CREATE TABLE IF NOT EXISTS public.trip_group_links (
  trip_id     uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  group_id    uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, group_id)
);
CREATE INDEX IF NOT EXISTS trip_group_links_group_idx ON public.trip_group_links (group_id);

ALTER TABLE public.trip_group_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_group_links FORCE ROW LEVEL SECURITY;

-- Read: trip owner/member OR group member.
DROP POLICY IF EXISTS trip_group_links_party_select ON public.trip_group_links;
CREATE POLICY trip_group_links_party_select ON public.trip_group_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trips t
             WHERE t.id = trip_group_links.trip_id AND t.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.trip_members tm
                WHERE tm.trip_id = trip_group_links.trip_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_memberships m
                WHERE m.group_id = trip_group_links.group_id AND m.user_id = auth.uid())
  );

-- Insert: only the trip owner, and only to groups they're a member of.
DROP POLICY IF EXISTS trip_group_links_owner_insert ON public.trip_group_links;
CREATE POLICY trip_group_links_owner_insert ON public.trip_group_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.trips t
                 WHERE t.id = trip_group_links.trip_id AND t.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.group_memberships m
                 WHERE m.group_id = trip_group_links.group_id AND m.user_id = auth.uid())
  );

-- Delete: trip owner or group admin/moderator.
DROP POLICY IF EXISTS trip_group_links_owner_or_mod_delete ON public.trip_group_links;
CREATE POLICY trip_group_links_owner_or_mod_delete ON public.trip_group_links
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trips t
             WHERE t.id = trip_group_links.trip_id AND t.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_memberships m
                WHERE m.group_id = trip_group_links.group_id
                  AND m.user_id = auth.uid()
                  AND m.role IN ('admin','moderator'))
  );
