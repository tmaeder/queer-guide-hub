-- Superseded 8 minutes later by 20260823233540_..._constant_anchor.
--
-- Kept because it is real applied history, and because the mistake in it is the
-- instructive part: it replaced `ORDER BY random()` (which materialised all
-- 60,725 matching rows before sorting, and timed out under PostgREST) with a
-- random ANCHOR into the primary-key index — correct idea, but the anchor was
-- computed in a CTE, and a CTE value is not a constant the planner can push into
-- an index condition. 3.2s instead of 59ms. See the successor for the fix.
--
-- The body is intentionally not repeated here; 20260823233540 replaces the
-- function wholesale, so re-running this file would only reinstate the slow
-- shape. What it also did, and what matters, is un-pause the automation: three
-- statement timeouts in a row tripped the auto-pause net from 20260523340000
-- and disabled the registry row.
UPDATE public.admin_automations
SET enabled = true, consecutive_failures = 0
WHERE slug = 'marketplace_image_upscale';
