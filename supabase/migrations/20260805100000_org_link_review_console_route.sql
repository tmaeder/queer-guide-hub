-- Business link review moved from /admin/business?tab=review to the Quality hub,
-- where every other review gate already lives. The old deep link now redirects,
-- so point the registered console at the real home.
--
-- Deliberately unchanged: active=true (the items stay visible in the one inbox)
-- and count_key/count_prefix (get_admin_counts must keep emitting
-- `review_org_links` — the Quality hub card reads it).
UPDATE public.triage_sources
SET capabilities = jsonb_set(capabilities, '{external_console}', '"/admin/quality"')
WHERE queue_key = 'org-link-review';
