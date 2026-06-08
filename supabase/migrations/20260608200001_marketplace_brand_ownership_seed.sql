-- P0 seed: confident, well-documented queer-owned brands (public self-identification).
-- These businesses market their own LGBTQ+ ownership as brand identity — safe to assert,
-- not outing private individuals. Uncertain fetish/rubber/AB brands stay 'pending' for
-- admin review. Matched by top_source (single-brand sources are 1:1 with the brand).
-- Idempotent: only flips rows still 'pending'.

UPDATE public.marketplace_brands SET
  ownership_tags = v.tags, status='approved', detection_source='curated_seed',
  confidence = v.conf, evidence = v.evidence, reviewed_at = now(), updated_at = now()
FROM (VALUES
  ('tomboyx',           ARRAY['queer_owned','women_owned']::text[], 0.95, 'Founded by married queer couple Fran Dunaway & Naomi Gonzalez-Longstaff; publicly LGBTQ+ women-owned.'),
  ('automicgold',       ARRAY['queer_owned','trans_owned']::text[], 0.92, 'Self-identifies as queer- and trans-owned; size-inclusive fine jewelry, NYC.'),
  ('ashandchess',       ARRAY['queer_owned','trans_owned']::text[], 0.95, 'Founders Ashley Molesso (queer) & Chess Needham (trans); explicitly queer & trans-owned.'),
  ('supergayunderwear', ARRAY['queer_owned']::text[],               0.95, 'Queer-owned apparel brand (name + public brand identity).'),
  ('wegan',             ARRAY['queer_owned','women_owned']::text[], 0.90, 'Founded by a lesbian couple; queer women-owned.'),
  ('wildfang',          ARRAY['queer_owned','women_owned']::text[], 0.90, 'Queer women-owned apparel ("by tomboys, for tomboys").'),
  ('kirrinfinch',       ARRAY['queer_owned','women_owned']::text[], 0.92, 'Founded by married queer couple Laura & Kelly Sanders Moffat; queer women-owned.')
) AS v(src, tags, conf, evidence)
WHERE public.marketplace_brands.top_source = v.src
  AND public.marketplace_brands.status = 'pending';
