-- Anon SELECT grants for public lookup tables + RPC.
--
-- These tables already have RLS policies for `public` (anon + authenticated),
-- but the table-level GRANT to `anon` was missing, so anonymous browsers got
-- 401 from PostgREST before RLS even evaluated. Same story for
-- get_broken_marketplace_ids: useMarketplace runs it on every public listing
-- fetch, but neither anon nor authenticated had EXECUTE.
--
-- Symptoms before this migration:
--   /venues, /events  → 401 on accessibility_attributes + target_groups
--                       (filters silently empty)
--   /marketplace      → 401 on rpc/get_broken_marketplace_ids
--                       (broken-listing filter silently disabled)

GRANT SELECT ON public.accessibility_attributes TO anon;
GRANT SELECT ON public.target_groups TO anon;
GRANT EXECUTE ON FUNCTION public.get_broken_marketplace_ids() TO anon, authenticated;
