-- Entity relationship layer for personalities. Polymorphic target: a personality
-- relates to another personality, a venue, an event, or a queer_village.
-- Feeds the react-force-graph UI via get_personality_graph_data().

CREATE TABLE IF NOT EXISTS public.personality_relationships (
  id                    BIGSERIAL PRIMARY KEY,
  source_personality_id UUID NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,
  target_type           TEXT NOT NULL CHECK (target_type IN ('personality','venue','event','queer_village')),
  target_personality_id UUID REFERENCES public.personalities(id) ON DELETE CASCADE,
  target_entity_id      UUID,
  relationship_type     TEXT NOT NULL,
  weight                NUMERIC NOT NULL DEFAULT 1.0,
  source                TEXT NOT NULL DEFAULT 'auto',
  detail                JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pr_no_self CHECK (NOT (target_type='personality' AND target_personality_id = source_personality_id)),
  CONSTRAINT pr_target_shape CHECK (
    (target_type='personality' AND target_personality_id IS NOT NULL AND target_entity_id IS NULL)
    OR (target_type<>'personality' AND target_entity_id IS NOT NULL AND target_personality_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pr_uniq_personality
  ON public.personality_relationships (source_personality_id, target_personality_id, relationship_type)
  WHERE target_type='personality';
CREATE UNIQUE INDEX IF NOT EXISTS pr_uniq_entity
  ON public.personality_relationships (source_personality_id, target_type, target_entity_id, relationship_type)
  WHERE target_type<>'personality';
CREATE INDEX IF NOT EXISTS pr_source_idx ON public.personality_relationships (source_personality_id);
CREATE INDEX IF NOT EXISTS pr_target_personality_idx ON public.personality_relationships (target_personality_id) WHERE target_type='personality';

ALTER TABLE public.personality_relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='personality_relationships' AND policyname='pr_public_read') THEN
    CREATE POLICY "pr_public_read" ON public.personality_relationships FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='personality_relationships' AND policyname='pr_admin_write') THEN
    CREATE POLICY "pr_admin_write" ON public.personality_relationships FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;
GRANT SELECT ON public.personality_relationships TO anon, authenticated;
GRANT ALL ON public.personality_relationships TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.personality_relationships_id_seq TO service_role;

COMMENT ON TABLE public.personality_relationships IS
  'Polymorphic personality relationship edges (personality/venue/event/queer_village). Auto-built + curatable. Feeds get_personality_graph_data().';
