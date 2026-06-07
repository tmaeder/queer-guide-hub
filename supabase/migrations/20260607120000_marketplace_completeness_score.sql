-- Honest completeness score for marketplace listings (Phase 2, design
-- docs/plans/2026-06-07-marketplace-truth-loop-design.md). Replaces the
-- decorative quality_score that read ~95.6 while 58% of listings had no
-- description. Pure function of the row's own completeness signals — NOT
-- relevance (relevance is a separate, currently-miscalibrated signal and must
-- not inflate "quality").
--   description >=50 chars : 30
--   has image              : 30
--   has price              : 20
--   has brand              : 10
--   link not broken        : 10
CREATE OR REPLACE FUNCTION marketplace_completeness_score(
  p_description text,
  p_images text[],
  p_price numeric,
  p_price_usd numeric,
  p_brand text,
  p_link_health text
) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (CASE WHEN length(coalesce(p_description,'')) >= 50 THEN 30 ELSE 0 END)
  + (CASE WHEN p_images IS NOT NULL AND array_length(p_images,1) >= 1 THEN 30 ELSE 0 END)
  + (CASE WHEN coalesce(p_price_usd, p_price) IS NOT NULL THEN 20 ELSE 0 END)
  + (CASE WHEN length(trim(coalesce(p_brand,''))) > 0 THEN 10 ELSE 0 END)
  + (CASE WHEN coalesce(p_link_health,'') <> 'broken' THEN 10 ELSE 0 END)
$$;

-- Nightly recompute, mirroring run_event_trust_recompute / run_city_trust_recompute.
-- Only writes rows whose score actually changed.
CREATE OR REPLACE FUNCTION public.run_marketplace_quality_recompute()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE marketplace_listings m
  SET quality_score = marketplace_completeness_score(
        m.description, m.images, m.price, m.price_usd, m.brand, m.link_health)
  WHERE m.quality_score IS DISTINCT FROM marketplace_completeness_score(
        m.description, m.images, m.price, m.price_usd, m.brand, m.link_health);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

SELECT cron.schedule(
  'marketplace_quality_recompute',
  '50 3 * * *',
  $$SELECT public.run_marketplace_quality_recompute();$$
);

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'marketplace_quality_recompute',
  'Marketplace quality recompute',
  'Nightly honest completeness score (desc/image/price/brand/link) for marketplace listings. Replaces the decorative quality_score.',
  'system', true,
  '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  '{"fn":"run_marketplace_quality_recompute","type":"rpc"}'::jsonb,
  '50 3 * * *'
)
ON CONFLICT (slug) DO NOTHING;
