-- Safety Signal Co-Authoring
-- Curated rotating question pool + per-user time-decayed signal aggregation
-- on venue pages. No public reviews — only aggregates via RPC.

-- =========================================================================
-- 1. safety_signal_questions — curated pool, admin-managed
-- =========================================================================
CREATE TABLE public.safety_signal_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  prompt      TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'yes_no'
    CHECK (answer_type IN ('yes_no')),
  weight      NUMERIC NOT NULL DEFAULT 1.0,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_signal_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_signal_questions_public_select"
  ON public.safety_signal_questions FOR SELECT
  USING (active = true);

CREATE POLICY "safety_signal_questions_admin_all"
  ON public.safety_signal_questions FOR ALL
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

INSERT INTO public.safety_signal_questions (slug, prompt, sort_order) VALUES
  ('felt_safe_pda',            'Felt safe holding hands / showing affection here?', 1),
  ('staff_welcoming',          'Staff felt welcoming to LGBTQ+ guests?',             2),
  ('trans_inclusive_bathrooms','Bathrooms were trans-inclusive?',                    3),
  ('mixed_queer_crowd',        'There was a visibly mixed queer crowd?',             4),
  ('accessible_entry',         'Entry / space was physically accessible?',           5),
  ('comfortable_solo',         'Comfortable visiting alone?',                        6);

-- =========================================================================
-- 2. venue_safety_signals — raw responses, never publicly readable
-- =========================================================================
CREATE TABLE public.venue_safety_signals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.safety_signal_questions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer      BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  flagged_at  TIMESTAMPTZ
);

CREATE INDEX idx_venue_safety_signals_venue_q_time
  ON public.venue_safety_signals (venue_id, question_id, created_at DESC)
  WHERE flagged_at IS NULL;

CREATE INDEX idx_venue_safety_signals_user_venue_time
  ON public.venue_safety_signals (user_id, venue_id, created_at DESC);

CREATE INDEX idx_venue_safety_signals_user_day
  ON public.venue_safety_signals (user_id, created_at DESC);

ALTER TABLE public.venue_safety_signals ENABLE ROW LEVEL SECURITY;

-- Users can see their own rows only (for "you answered this recently" UX).
CREATE POLICY "venue_safety_signals_owner_select"
  ON public.venue_safety_signals FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- No public INSERT — only via SECURITY DEFINER RPC.
CREATE POLICY "venue_safety_signals_admin_all"
  ON public.venue_safety_signals FOR ALL
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- =========================================================================
-- 3. get_venue_safety_questions — return up to 2 questions user hasn't
-- answered in last 30 days for this venue.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_venue_safety_questions(p_venue_id UUID)
RETURNS TABLE (
  question_id UUID,
  slug        TEXT,
  prompt      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id, q.slug, q.prompt
  FROM public.safety_signal_questions q
  WHERE q.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.venue_safety_signals s
      WHERE s.user_id = v_user
        AND s.venue_id = p_venue_id
        AND s.question_id = q.id
        AND s.created_at > now() - INTERVAL '30 days'
    )
  ORDER BY
    -- deterministic per-user rotation
    (('x' || substr(md5(v_user::text || p_venue_id::text || q.id::text), 1, 8))::bit(32)::int),
    q.sort_order
  LIMIT 2;
END;
$$;

ALTER FUNCTION public.get_venue_safety_questions(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_venue_safety_questions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_safety_questions(UUID) TO authenticated;

-- =========================================================================
-- 4. submit_venue_safety_signal — guarded INSERT
-- =========================================================================
CREATE OR REPLACE FUNCTION public.submit_venue_safety_signal(
  p_venue_id    UUID,
  p_question_id UUID,
  p_answer      BOOLEAN
)
RETURNS TABLE (ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      UUID := auth.uid();
  v_age_days  NUMERIC;
  v_recent    INT;
  v_day_count INT;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN QUERY SELECT false, 'venue_not_found'; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.safety_signal_questions
    WHERE id = p_question_id AND active = true
  ) THEN
    RETURN QUERY SELECT false, 'question_not_found'; RETURN;
  END IF;

  SELECT EXTRACT(EPOCH FROM (now() - u.created_at)) / 86400.0
  INTO v_age_days
  FROM auth.users u WHERE u.id = v_user;

  IF v_age_days IS NULL OR v_age_days < 7 THEN
    RETURN QUERY SELECT false, 'account_too_new'; RETURN;
  END IF;

  -- Per-(user, venue, question) rate limit: 30 days
  SELECT COUNT(*) INTO v_recent
  FROM public.venue_safety_signals
  WHERE user_id = v_user
    AND venue_id = p_venue_id
    AND question_id = p_question_id
    AND created_at > now() - INTERVAL '30 days';

  IF v_recent > 0 THEN
    RETURN QUERY SELECT false, 'rate_limited_question'; RETURN;
  END IF;

  -- Daily platform cap
  SELECT COUNT(*) INTO v_day_count
  FROM public.venue_safety_signals
  WHERE user_id = v_user
    AND created_at > now() - INTERVAL '1 day';

  IF v_day_count >= 20 THEN
    RETURN QUERY SELECT false, 'rate_limited_daily'; RETURN;
  END IF;

  INSERT INTO public.venue_safety_signals (venue_id, question_id, user_id, answer)
  VALUES (p_venue_id, p_question_id, v_user, p_answer);

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

ALTER FUNCTION public.submit_venue_safety_signal(UUID, UUID, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_venue_safety_signal(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_venue_safety_signal(UUID, UUID, BOOLEAN) TO authenticated;

-- =========================================================================
-- 5. get_venue_safety_score — public aggregate, 90-day half-life decay,
-- Wilson confidence interval on raw counts.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_venue_safety_score(p_venue_id UUID)
RETURNS TABLE (
  question_slug    TEXT,
  prompt           TEXT,
  yes_weighted     NUMERIC,
  no_weighted      NUMERIC,
  n_responses      INT,
  score            NUMERIC,
  confidence_low   NUMERIC,
  confidence_high  NUMERIC,
  last_signal_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      q.slug,
      q.prompt,
      SUM(CASE WHEN s.answer       THEN exp(-ln(2.0) * EXTRACT(EPOCH FROM (now() - s.created_at)) / 86400.0 / 90.0) ELSE 0 END) AS yes_w,
      SUM(CASE WHEN NOT s.answer   THEN exp(-ln(2.0) * EXTRACT(EPOCH FROM (now() - s.created_at)) / 86400.0 / 90.0) ELSE 0 END) AS no_w,
      COUNT(*)::int AS n,
      SUM(CASE WHEN s.answer THEN 1 ELSE 0 END)::int AS k_yes,
      MAX(s.created_at) AS last_at
    FROM public.safety_signal_questions q
    LEFT JOIN public.venue_safety_signals s
      ON s.question_id = q.id
     AND s.venue_id   = p_venue_id
     AND s.flagged_at IS NULL
     AND s.created_at > now() - INTERVAL '365 days'
    WHERE q.active = true
    GROUP BY q.id, q.slug, q.prompt, q.sort_order
    ORDER BY q.sort_order
  ),
  wilson AS (
    SELECT
      slug,
      prompt,
      yes_w,
      no_w,
      n,
      last_at,
      CASE WHEN (yes_w + no_w) > 0 THEN yes_w / (yes_w + no_w) ELSE NULL END AS score_w,
      CASE WHEN n > 0 THEN k_yes::numeric / n ELSE NULL END AS phat
    FROM agg
  )
  SELECT
    slug,
    prompt,
    ROUND(yes_w::numeric, 4),
    ROUND(no_w::numeric, 4),
    n,
    ROUND(score_w::numeric, 4),
    CASE WHEN n >= 3 THEN
      GREATEST(0::numeric, ROUND(((phat + (1.96^2)/(2*n) - 1.96 * sqrt((phat*(1-phat) + (1.96^2)/(4*n)) / n)) / (1 + (1.96^2)/n))::numeric, 4))
    ELSE NULL END,
    CASE WHEN n >= 3 THEN
      LEAST(1::numeric, ROUND(((phat + (1.96^2)/(2*n) + 1.96 * sqrt((phat*(1-phat) + (1.96^2)/(4*n)) / n)) / (1 + (1.96^2)/n))::numeric, 4))
    ELSE NULL END,
    last_at
  FROM wilson;
$$;

ALTER FUNCTION public.get_venue_safety_score(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_venue_safety_score(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_safety_score(UUID) TO anon, authenticated;

-- =========================================================================
-- 6. flag_venue_safety_signal — admin only
-- =========================================================================
CREATE OR REPLACE FUNCTION public.flag_venue_safety_signal(p_signal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  UPDATE public.venue_safety_signals
  SET flagged_at = now()
  WHERE id = p_signal_id AND flagged_at IS NULL;

  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.flag_venue_safety_signal(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flag_venue_safety_signal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_venue_safety_signal(UUID) TO authenticated;

COMMENT ON TABLE public.safety_signal_questions IS 'Curated rotating pool of 2-tap safety/inclusivity prompts shown on venue pages.';
COMMENT ON TABLE public.venue_safety_signals IS 'Per-user binary responses. Never publicly readable — only aggregated via get_venue_safety_score().';
COMMENT ON FUNCTION public.get_venue_safety_score(UUID) IS '90-day half-life weighted yes-ratio + Wilson 95% CI per question. Hides questions with n<3.';
