-- RECOVERED FILE (2026-08-02). This version was applied to production without a
-- committed migration file, which makes `supabase db push` skip — so every
-- merged migration after it silently never applies, and `migration-versions`
-- fails on every PR in the repo. It blocked #2522.
--
-- Recovered verbatim from supabase_migrations.schema_migrations.statements at
-- version 20260802155832 (name: merchants_due_for_sync_include_crawl), per the
-- recovery procedure in CLAUDE.md. NOT authored here and not modified: the body
-- below is exactly what is already live. `CREATE OR REPLACE` makes re-running it
-- a no-op against prod while giving every other environment the same state.
--
-- The original commentary is preserved as-is.

-- Let provider='crawl' merchants into the hourly sync LRU, now that source-shop-crawl
-- exists to serve them (they were registered in July 2026 against a crawler that was
-- never built, so every one has imported zero products).
--
-- The config predicate is load-bearing, NOT decoration: not every crawl row is an
-- inert placeholder. `mrsleather` is is_enabled=true with config {"method":
-- "jsonld-crawl"} — a naming from the abandoned design that source-shop-crawl does not
-- understand. Admitting crawl rows unconditionally would put it into the hourly run
-- where it would fail every hour forever. Requiring the keys the crawler actually
-- reads means a merchant joins the rotation exactly when it becomes servable.
--
-- Signature is unchanged deliberately: adding a defaulted second parameter would
-- create an overload and make the existing rpc('merchants_due_for_sync', {p_limit})
-- call ambiguous (PostgREST 300).
CREATE OR REPLACE FUNCTION public.merchants_due_for_sync(p_limit integer DEFAULT 6)
 RETURNS TABLE(provider text, slug text, display_name text, shop_domain text, config jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT m.provider, m.slug, m.display_name, m.shop_domain, m.config
  FROM public.marketplace_merchants m
  WHERE m.is_enabled
    AND m.shop_domain IS NOT NULL
    AND (
      m.provider IN ('shopify-public', 'woocommerce-public')
      OR (m.provider = 'crawl' AND m.config ? 'sitemap' AND m.config ? 'strategy')
    )
  ORDER BY m.last_sync_at ASC NULLS FIRST, m.created_at ASC
  LIMIT greatest(1, coalesce(p_limit, 6));
$function$;
