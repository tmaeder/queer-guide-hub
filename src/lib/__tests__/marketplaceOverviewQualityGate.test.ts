import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const migration = read('supabase/migrations/99991790898960_marketplace_overview_quality_gate.sql');
const marketplace = read('src/hooks/useMarketplace.tsx');
const rows = read('src/hooks/useMarketplaceRows.tsx');
const queries = read('src/hooks/useMarketplaceQueries.tsx');
const brands = read('src/hooks/useMarketplaceBrands.ts');
const collections = read('src/hooks/useMarketplaceCollections.tsx');
const cards = read('src/components/marketplace/MarketplaceCard.tsx');
const entityAssets = read('src/hooks/useEntityImageAssets.ts');
const packing = read('src/hooks/useTripPackingSuggestions.ts');
const reservations = read('src/hooks/useTripReservationSuggestions.ts');
const guidePicks = read('src/lib/guidePickAdapters.ts');

describe('marketplace overview quality gate', () => {
  it('defines one cached, indexed, trigger-refreshed eligibility contract', () => {
    expect(migration).toContain('overview_eligible boolean NOT NULL DEFAULT false');
    expect(migration).toContain('overview_image_asset_id uuid');
    expect(migration).toContain('overview_exclusion_reasons text[]');
    expect(migration).toContain('marketplace_listings_overview_browse_idx');
    expect(migration).toContain('marketplace_refresh_overview_eligibility');
    expect(migration).toContain('marketplace_refresh_overview_from_listing_trg');
    expect(migration).toContain('marketplace_refresh_overview_from_link_trg');
    expect(migration).toContain('marketplace_refresh_overview_from_asset_trg');
  });

  it('rejects vouchers while preserving products that merely hold vouchers', () => {
    expect(migration).toContain('marketplace_listing_is_voucher');
    for (const term of [
      'gift[ -]?cards?',
      'gift certificates?',
      'store credits?',
      'coupon codes?',
      'vouchers?',
      'gutscheine?',
      'geschenkgutscheine?',
    ]) {
      expect(migration).toContain(term);
    }
    expect(migration).toContain('Leather gift card holder');
    expect(migration).toContain("'voucher'");
  });

  it('requires a healthy, optimized, public image with both axes at least 600px', () => {
    expect(migration).toContain("ia.status = 'active'");
    expect(migration).toContain('NOT ia.is_flagged');
    expect(migration).toContain("ia.access_level = 'public'");
    expect(migration).toContain("ia.optimization_status IN ('optimized','cdn_optimized')");
    expect(migration).toContain('coalesce(ia.health_consecutive_failures, 0) < 2');
    expect(migration).toContain('ia.width >= 600');
    expect(migration).toContain('ia.height >= 600');
    expect(migration).toContain("'logo','color','typography','iconography','template','guideline'");
  });

  it('gates every direct public discovery query', () => {
    expect(marketplace.match(/\.eq\('overview_eligible', true\)/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(rows.match(/\.eq\('overview_eligible', true\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(queries.match(/\.eq\('overview_eligible', true\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(brands.match(/\.eq\('overview_eligible', true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(
      collections.match(/marketplace_listings\.overview_eligible/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(packing).toContain(".eq('overview_eligible', true)");
    expect(reservations).toContain(".eq('overview_eligible', true)");
    expect(guidePicks).toContain(
      "if (type === 'marketplace') query = query.eq('overview_eligible', true)",
    );
  });

  it('gates SQL browse, facets, maker covers, and search documents', () => {
    expect(migration).toContain('public.marketplace_browse_page(jsonb,jsonb,text,integer,integer)');
    expect(migration).toContain('public.get_marketplace_facets(text,text,text,uuid,boolean)');
    expect(migration).toContain('public.get_marketplace_attribute_facets(text,text,boolean)');
    expect(migration).toMatch(
      /search_documents_index_marketplace[\s\S]*WHERE m\.overview_eligible/,
    );
    expect(migration).toMatch(/get_marketplace_brand_directory[\s\S]*l\.overview_eligible/);
    expect(migration).toMatch(/get_marketplace_brand_covers[\s\S]*l\.overview_eligible/);
    expect(migration).toMatch(/patch_tag_shop_rail[\s\S]*m\.overview_eligible/);
  });

  it('pins governed cards to the exact approved image without raw hover fallback', () => {
    expect(cards).toContain('imageAsset?.id === listing.overview_image_asset_id');
    expect(cards).toContain('imageUrl: governedOverviewImage?.url ?? null');
    expect(cards).toContain('listing.overview_eligible ? null');
    expect(entityAssets).toContain('marketplaceOverviewAssetIsEligible');
    expect(entityAssets).toContain('(asset.width ?? 0) >= 600');
    expect(entityAssets).toContain('(asset.height ?? 0) >= 600');
  });

  it('keeps personal/shared hydration opt-in rather than silently filtering it', () => {
    const hydration = read('src/hooks/useMarketplaceListingsByIds.tsx');
    const pairs = read('src/components/marketplace/PairsWithRail.tsx');
    const share = read('src/pages/MarketplaceShare.tsx');
    expect(hydration).toContain('overviewOnly = false');
    expect(hydration).toContain("if (overviewOnly) query = query.eq('overview_eligible', true)");
    expect(pairs).toContain('useMarketplaceListingsByIds(ids ?? [], true)');
    expect(share).toContain('useMarketplaceListingsByIds(ids)');
  });
});
