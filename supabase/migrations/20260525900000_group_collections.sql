-- Followup to milestone Phase 7 — group collections.
--
-- Members can build shared lists of venues / events / marketplace listings /
-- trips inside their group. Two tables:
--   group_collections        — named bucket per group
--   group_collection_items   — typed item references inside a bucket
--
-- Per plan §Phase 7: "group collections" + "Add to group collection" action
-- on entity cards (action wiring in a follow-up; tables + read+write paths
-- ship here).

CREATE TABLE IF NOT EXISTS public.group_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text,
  cover_url   text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, slug)
);
CREATE INDEX IF NOT EXISTS group_collections_group_idx ON public.group_collections (group_id);

ALTER TABLE public.group_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_collections FORCE ROW LEVEL SECURITY;

-- Members read; non-private groups also publicly readable so the collection
-- can be shared off-platform.
DROP POLICY IF EXISTS group_collections_member_or_public_select ON public.group_collections;
CREATE POLICY group_collections_member_or_public_select ON public.group_collections
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_groups g
       WHERE g.id = group_collections.group_id
         AND (
           g.is_private = false
           OR EXISTS (
             SELECT 1 FROM public.group_memberships m
              WHERE m.group_id = g.id AND m.user_id = auth.uid()
           )
         )
    )
  );

DROP POLICY IF EXISTS group_collections_member_insert ON public.group_collections;
CREATE POLICY group_collections_member_insert ON public.group_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_memberships m
       WHERE m.group_id = group_collections.group_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS group_collections_creator_or_mod_update ON public.group_collections;
CREATE POLICY group_collections_creator_or_mod_update ON public.group_collections
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
       WHERE m.group_id = group_collections.group_id
         AND m.user_id = auth.uid()
         AND m.role IN ('admin','moderator')
    )
  );

DROP POLICY IF EXISTS group_collections_creator_or_mod_delete ON public.group_collections;
CREATE POLICY group_collections_creator_or_mod_delete ON public.group_collections
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
       WHERE m.group_id = group_collections.group_id
         AND m.user_id = auth.uid()
         AND m.role IN ('admin','moderator')
    )
  );


CREATE TABLE IF NOT EXISTS public.group_collection_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES public.group_collections(id) ON DELETE CASCADE,
  item_type      text NOT NULL CHECK (item_type IN ('venue','event','listing','trip')),
  item_id        uuid NOT NULL,
  note           text,
  added_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS group_collection_items_collection_idx
  ON public.group_collection_items (collection_id, added_at DESC);

ALTER TABLE public.group_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_collection_items FORCE ROW LEVEL SECURITY;

-- Inherit read access from parent collection.
DROP POLICY IF EXISTS group_collection_items_inherit_select ON public.group_collection_items;
CREATE POLICY group_collection_items_inherit_select ON public.group_collection_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_collections c
      JOIN public.community_groups g ON g.id = c.group_id
     WHERE c.id = group_collection_items.collection_id
       AND (
         g.is_private = false
         OR EXISTS (
           SELECT 1 FROM public.group_memberships m
            WHERE m.group_id = g.id AND m.user_id = auth.uid()
         )
       )
  ));

-- Group members can add items; adder must be self.
DROP POLICY IF EXISTS group_collection_items_member_insert ON public.group_collection_items;
CREATE POLICY group_collection_items_member_insert ON public.group_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_collections c
        JOIN public.group_memberships m ON m.group_id = c.group_id
       WHERE c.id = group_collection_items.collection_id
         AND m.user_id = auth.uid()
    )
  );

-- Adder or any mod can remove.
DROP POLICY IF EXISTS group_collection_items_adder_or_mod_delete ON public.group_collection_items;
CREATE POLICY group_collection_items_adder_or_mod_delete ON public.group_collection_items
  FOR DELETE TO authenticated
  USING (
    added_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_collections c
        JOIN public.group_memberships m ON m.group_id = c.group_id
       WHERE c.id = group_collection_items.collection_id
         AND m.user_id = auth.uid()
         AND m.role IN ('admin','moderator')
    )
  );
