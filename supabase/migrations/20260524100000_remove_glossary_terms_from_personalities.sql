-- 385 BDSM/queer glossary terms were ingested as personality rows on 2026-04-26
-- across 4 batches at 11:29:50-56 UTC (Dominant, Age Play, Bull Whip, Slave,
-- Master, BDSM, etc.). 381/385 already exist in unified_tags (BDSM & Power
-- Exchange category). Remaining 4 are hallucinated junk (MLM described as
-- multi-level marketing, Boi as a programming language). Signature: all NULL
-- profession/birth_date/nationality/created_by/image_url, none featured,
-- none verified, max 11 views. Surfaced on /personalities?page=3.
DELETE FROM personalities
WHERE created_at IN (
  '2026-04-26 11:29:50.883199+00',
  '2026-04-26 11:29:52.775154+00',
  '2026-04-26 11:29:54.595037+00',
  '2026-04-26 11:29:56.550644+00'
)
  AND profession IS NULL
  AND birth_date IS NULL
  AND nationality IS NULL
  AND created_by IS NULL
  AND image_url IS NULL
  AND NOT is_featured
  AND verification_status <> 'verified';
