-- City Completion Maps: user_place_marks
-- Private spatial "passport" per user. Tracks visited/saved/contributed marks
-- on venues, events, queer_villages. RLS: private by default, optional public flag.

CREATE TYPE place_mark_entity AS ENUM ('venue', 'event', 'village');
CREATE TYPE place_mark_kind   AS ENUM ('visited', 'saved', 'contributed');

CREATE TABLE user_place_marks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type  place_mark_entity NOT NULL,
  entity_id    UUID NOT NULL,
  mark_type    place_mark_kind NOT NULL,
  city_id      UUID REFERENCES cities(id) ON DELETE SET NULL,
  is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  note         TEXT,
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id, mark_type)
);

CREATE INDEX user_place_marks_user_idx       ON user_place_marks (user_id, marked_at DESC);
CREATE INDEX user_place_marks_user_city_idx  ON user_place_marks (user_id, city_id);
CREATE INDEX user_place_marks_user_kind_idx  ON user_place_marks (user_id, mark_type);
CREATE INDEX user_place_marks_public_idx     ON user_place_marks (user_id) WHERE is_public;

ALTER TABLE user_place_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_marks_select_own"
  ON user_place_marks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "place_marks_select_public"
  ON user_place_marks FOR SELECT
  USING (is_public = TRUE);

CREATE POLICY "place_marks_insert_own"
  ON user_place_marks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "place_marks_update_own"
  ON user_place_marks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "place_marks_delete_own"
  ON user_place_marks FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_place_marks TO authenticated;

-- Auto-fill city_id from venue/event/village on insert if not provided.
CREATE OR REPLACE FUNCTION user_place_marks_fill_city()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.city_id IS NULL THEN
    IF NEW.entity_type = 'venue' THEN
      SELECT city_id INTO NEW.city_id FROM venues WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'event' THEN
      SELECT city_id INTO NEW.city_id FROM events WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'village' THEN
      SELECT city_id INTO NEW.city_id FROM queer_villages WHERE id = NEW.entity_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER user_place_marks_fill_city_trg
  BEFORE INSERT ON user_place_marks
  FOR EACH ROW EXECUTE FUNCTION user_place_marks_fill_city();

-- City completion: total markable entities per city (denominator for %).
CREATE OR REPLACE FUNCTION city_markable_totals(p_city_id UUID)
RETURNS TABLE (entity_type place_mark_entity, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'venue'::place_mark_entity,   COUNT(*)::BIGINT FROM venues          WHERE city_id = p_city_id
  UNION ALL
  SELECT 'event'::place_mark_entity,   COUNT(*)::BIGINT FROM events          WHERE city_id = p_city_id
  UNION ALL
  SELECT 'village'::place_mark_entity, COUNT(*)::BIGINT FROM queer_villages  WHERE city_id = p_city_id;
$$;

GRANT EXECUTE ON FUNCTION city_markable_totals(UUID) TO authenticated, anon;
