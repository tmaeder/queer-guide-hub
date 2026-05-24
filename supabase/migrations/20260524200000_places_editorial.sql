-- Editorial Atlas: editorial_hook columns + rails + covers + draft queue
-- Powers /places magazine layout (hero + rails + cards with hand-written hooks).
-- Drafts produced by pipeline-enrich-places edge function, approved in
-- /admin/places-editorial, then written back to the entity's editorial_hook.

-- ---------------------------------------------------------------------------
-- 1. Editorial hook columns on geographic entities
-- ---------------------------------------------------------------------------

ALTER TABLE countries
  ADD COLUMN IF NOT EXISTS editorial_hook TEXT,
  ADD COLUMN IF NOT EXISTS editorial_long TEXT;

ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS editorial_hook TEXT;

ALTER TABLE queer_villages
  ADD COLUMN IF NOT EXISTS editorial_hook TEXT;

COMMENT ON COLUMN countries.editorial_hook IS
  'Single-line editorial pull (≤120 chars), direct factual voice. Falls back to capital if NULL.';
COMMENT ON COLUMN countries.editorial_long IS
  'Optional 3–6 sentence editorial paragraph for hero/rail features.';
COMMENT ON COLUMN cities.editorial_hook IS
  'Single-line editorial pull (≤120 chars). Falls back to region/country if NULL.';
COMMENT ON COLUMN queer_villages.editorial_hook IS
  'Single-line editorial pull (≤120 chars).';

-- ---------------------------------------------------------------------------
-- 2. Editorial draft queue (LLM output, awaiting human review)
-- ---------------------------------------------------------------------------

CREATE TYPE editorial_entity_type AS ENUM ('country', 'city', 'village');
CREATE TYPE editorial_draft_status AS ENUM ('pending', 'approved', 'rejected', 'published');

CREATE TABLE editorial_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     editorial_entity_type NOT NULL,
  entity_id       UUID NOT NULL,
  draft_hook      TEXT,
  draft_long      TEXT,
  status          editorial_draft_status NOT NULL DEFAULT 'pending',
  reviewer_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note   TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  model           TEXT,
  UNIQUE (entity_type, entity_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX editorial_drafts_status_idx ON editorial_drafts (status, generated_at DESC);
CREATE INDEX editorial_drafts_entity_idx ON editorial_drafts (entity_type, entity_id);

ALTER TABLE editorial_drafts ENABLE ROW LEVEL SECURITY;

-- Admin-only access (uses existing is_admin helper).
CREATE POLICY "editorial_drafts_admin_all"
  ON editorial_drafts FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON editorial_drafts TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Editorial rails (admin-curated horizontal-scroll collections)
-- ---------------------------------------------------------------------------

CREATE TYPE editorial_rail_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE editorial_rails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  editor_note   TEXT,
  entity_type   editorial_entity_type NOT NULL,
  cluster_id    UUID REFERENCES topic_clusters(id) ON DELETE SET NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  status        editorial_rail_status NOT NULL DEFAULT 'draft',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX editorial_rails_published_idx
  ON editorial_rails (position, starts_at DESC)
  WHERE status = 'published';

CREATE TABLE editorial_rail_items (
  rail_id     UUID NOT NULL REFERENCES editorial_rails(id) ON DELETE CASCADE,
  entity_id   UUID NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rail_id, entity_id)
);

CREATE INDEX editorial_rail_items_position_idx
  ON editorial_rail_items (rail_id, position);

ALTER TABLE editorial_rails ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_rail_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editorial_rails_public_read_published"
  ON editorial_rails FOR SELECT
  USING (
    status = 'published'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

CREATE POLICY "editorial_rails_admin_all"
  ON editorial_rails FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "editorial_rail_items_public_read_published"
  ON editorial_rail_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM editorial_rails r
    WHERE r.id = editorial_rail_items.rail_id
      AND r.status = 'published'
      AND (r.starts_at IS NULL OR r.starts_at <= now())
      AND (r.ends_at   IS NULL OR r.ends_at   >  now())
  ));

CREATE POLICY "editorial_rail_items_admin_all"
  ON editorial_rail_items FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON editorial_rails, editorial_rail_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON editorial_rails, editorial_rail_items TO authenticated;

CREATE OR REPLACE FUNCTION editorial_rails_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER editorial_rails_touch_trg
  BEFORE UPDATE ON editorial_rails
  FOR EACH ROW EXECUTE FUNCTION editorial_rails_touch();

-- ---------------------------------------------------------------------------
-- 4. Editorial covers (hero "destination of the week")
-- ---------------------------------------------------------------------------

CREATE TABLE editorial_covers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     editorial_entity_type NOT NULL,
  entity_id       UUID NOT NULL,
  headline        TEXT NOT NULL,
  pull_quote      TEXT,
  hero_image_url  TEXT,
  author          TEXT,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ,
  published       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX editorial_covers_active_idx
  ON editorial_covers (starts_at DESC)
  WHERE published = TRUE;

ALTER TABLE editorial_covers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editorial_covers_public_read_published"
  ON editorial_covers FOR SELECT
  USING (
    published = TRUE
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

CREATE POLICY "editorial_covers_admin_all"
  ON editorial_covers FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON editorial_covers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON editorial_covers TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: current_editorial_cover
-- Most-recent active cover; NULL if none.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_editorial_cover()
RETURNS TABLE (
  id              UUID,
  entity_type     editorial_entity_type,
  entity_id       UUID,
  headline        TEXT,
  pull_quote      TEXT,
  hero_image_url  TEXT,
  author          TEXT,
  starts_at       TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, entity_type, entity_id, headline, pull_quote, hero_image_url, author, starts_at
  FROM editorial_covers
  WHERE published = TRUE
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  ORDER BY starts_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_editorial_cover() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: approve_editorial_draft
-- Atomically copies a draft's hook/long to the underlying entity and marks
-- the draft as published.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION approve_editorial_draft(p_draft_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d editorial_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO d FROM editorial_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  IF d.entity_type = 'country' THEN
    UPDATE countries
      SET editorial_hook = COALESCE(d.draft_hook, editorial_hook),
          editorial_long = COALESCE(d.draft_long, editorial_long)
      WHERE id = d.entity_id;
  ELSIF d.entity_type = 'city' THEN
    UPDATE cities
      SET editorial_hook = COALESCE(d.draft_hook, editorial_hook)
      WHERE id = d.entity_id;
  ELSIF d.entity_type = 'village' THEN
    UPDATE queer_villages
      SET editorial_hook = COALESCE(d.draft_hook, editorial_hook)
      WHERE id = d.entity_id;
  END IF;

  UPDATE editorial_drafts
    SET status = 'published',
        reviewer_id = auth.uid(),
        reviewed_at = now(),
        published_at = now()
    WHERE id = p_draft_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_editorial_draft(UUID) TO authenticated;
