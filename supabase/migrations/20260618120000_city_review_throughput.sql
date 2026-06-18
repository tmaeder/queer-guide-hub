-- City review-queue throughput.
--
-- The city_review_queue had become a graveyard: editorial_hook + lgbt_friendly_rating
-- were empty for 100% of live cities because both are review-gated and the queue was
-- never cleared. Two changes:
--   1. One-time drain: auto-approve already-queued editorial_hook rows for EXPLICITLY-SAFE
--      destinations (legal === true) that carry citations. editorial_hook is non-safety
--      editorial copy; criminalizing / unknown-legal rows stay queued for manual review.
--   2. New batch RPC batch_approve_cited_city_ratings(): one-click clearing of cited
--      lgbt_friendly_rating reviews for non-criminalizing destinations. The rating stays
--      human-INITIATED (an admin clicks the button) — this only removes the per-row toil,
--      and NEVER touches criminalizing / death-penalty destinations.
--
-- Outing-safety invariant preserved: criminalizing/death-penalty destinations are never
-- touched by either path.

-- ===== 1. One-time drain of queued editorial_hook (explicitly-safe + cited) ==========
DO $$
DECLARE
  rec record;
  v_text text;
BEGIN
  FOR rec IN
    SELECT q.id AS review_id, q.city_id, q.proposed_value, q.confidence, q.citations
    FROM public.city_review_queue q
    JOIN public.cities c     ON c.id = q.city_id
    JOIN public.countries co ON co.id = c.country_id
    WHERE q.field = 'editorial_hook'
      AND q.status = 'open'
      AND (co.lgbti_criminalization->>'legal') = 'true'          -- explicitly safe only
      AND jsonb_typeof(q.citations) = 'array'
      AND jsonb_array_length(q.citations) > 0                    -- grounded
      AND coalesce(c.editorial_hook, '') = ''                    -- empty column only
  LOOP
    v_text := left(coalesce(rec.proposed_value->>'value', ''), 120);
    CONTINUE WHEN v_text = '';

    UPDATE public.cities SET
      editorial_hook = v_text,
      field_provenance = jsonb_set(coalesce(field_provenance, '{}'::jsonb), ARRAY['editorial_hook'],
        jsonb_build_object('value', v_text, 'source', 'llm', 'confidence', rec.confidence,
                           'approved_at', now(), 'via', 'backfill_safe'), true)
    WHERE id = rec.city_id;

    UPDATE public.city_review_queue SET status = 'approved', reviewed_at = now(),
      reviewer_note = 'batch-approved (editorial_hook, explicitly-safe + cited)'
    WHERE id = rec.review_id;

    INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
    VALUES (rec.city_id, 'editorial_hook', jsonb_build_object('value', v_text), 'llm', rec.confidence,
            'auto_commit', jsonb_build_object('via', 'backfill_safe', 'citations', rec.citations));

    IF NOT EXISTS (SELECT 1 FROM public.city_review_queue
                   WHERE city_id = rec.city_id AND status = 'open' AND id <> rec.review_id) THEN
      UPDATE public.cities SET needs_attention = false WHERE id = rec.city_id;
    END IF;
  END LOOP;
END $$;

-- ===== 2. batch_approve_cited_city_ratings(): one-click clear of cited ratings ========
-- Approves open lgbt_friendly_rating reviews that carry citations for NON-criminalizing,
-- NON-death-penalty destinations. Admin-initiated; mirrors batch_approve_safe_city_reviews.
CREATE OR REPLACE FUNCTION public.batch_approve_cited_city_ratings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  v_rating int;
  v_approved int := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  FOR rec IN
    SELECT q.id AS review_id, q.city_id, q.proposed_value, q.confidence, q.citations
    FROM public.city_review_queue q
    JOIN public.cities c     ON c.id = q.city_id
    JOIN public.countries co ON co.id = c.country_id
    WHERE q.field = 'lgbt_friendly_rating'
      AND q.status = 'open'
      AND (co.lgbti_criminalization->>'legal')         IS DISTINCT FROM 'false'  -- not criminalizing
      AND (co.lgbti_criminalization->>'death_penalty') IS DISTINCT FROM 'Yes'    -- not death penalty
      AND jsonb_typeof(q.citations) = 'array'
      AND jsonb_array_length(q.citations) > 0                                    -- cited only
  LOOP
    v_rating := greatest(1, least(5, round((rec.proposed_value->>'value')::numeric)::int));

    UPDATE public.cities SET
      lgbt_friendly_rating = v_rating,
      field_provenance = jsonb_set(coalesce(field_provenance, '{}'::jsonb), ARRAY['lgbt_friendly_rating'],
        jsonb_build_object('value', v_rating, 'source', 'llm+human', 'confidence', rec.confidence,
                           'approved_at', now(), 'via', 'batch_cited'), true)
    WHERE id = rec.city_id;

    UPDATE public.city_review_queue SET status = 'approved', reviewer_id = auth.uid(), reviewed_at = now(),
      reviewer_note = 'batch-approved (cited rating, non-criminalizing)'
    WHERE id = rec.review_id;

    INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
    VALUES (rec.city_id, 'lgbt_friendly_rating', jsonb_build_object('value', v_rating), 'llm+human',
            rec.confidence, 'auto_commit', jsonb_build_object('approved_by', auth.uid(), 'via', 'batch_cited', 'citations', rec.citations));

    IF NOT EXISTS (SELECT 1 FROM public.city_review_queue
                   WHERE city_id = rec.city_id AND status = 'open' AND id <> rec.review_id) THEN
      UPDATE public.cities SET needs_attention = false WHERE id = rec.city_id;
    END IF;

    v_approved := v_approved + 1;
  END LOOP;

  RETURN jsonb_build_object('approved', v_approved);
END; $$;
ALTER FUNCTION public.batch_approve_cited_city_ratings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.batch_approve_cited_city_ratings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_approve_cited_city_ratings() TO authenticated, service_role;
