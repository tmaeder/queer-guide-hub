import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHubLinksHtml, HUB_PATHS } from '../../functions/_lib/hubLinks';
import { STATIC_ROUTE_META, isIndexable } from '../../functions/_lib/routeMeta';
import { STATIC_ROUTE_BODY } from '../../functions/_lib/routeBody';
import { resolvedRoutes } from '../test/routeTable';

const { fetchRows } = vi.hoisted(() => ({ fetchRows: vi.fn() }));
vi.mock('../../functions/_lib/sitemap', () => ({ fetchRows }));

afterEach(() => vi.resetAllMocks());

describe('crawler hub route contracts', () => {
  it('places every hub on a real, indexable public page with its own body', () => {
    const pages = new Set(
      resolvedRoutes()
        .filter((r) => !r.isRedirectStub)
        .map((r) => r.path),
    );
    expect(pages.has('/tags/rights-by-country')).toBe(true);
    expect(HUB_PATHS).toContain('/tags/rights-by-country');
    expect(HUB_PATHS.length).toBeGreaterThan(5);
    for (const path of HUB_PATHS) {
      expect(pages.has(path), `${path} has no public page`).toBe(true);
      expect(STATIC_ROUTE_META[path], `${path} has no metadata`).toBeDefined();
      expect(STATIC_ROUTE_BODY[path], `${path} has no crawler body`).toBeDefined();
      expect(isIndexable(path), `${path} is not indexable`).toBe(true);
    }
  });

  it('serves country detail links on the country index and leaves the missing route empty', async () => {
    fetchRows.mockResolvedValue([{ slug: 'germany', name: 'Germany' }]);
    const html = await buildHubLinksHtml({ ASSETS: { fetch } }, '/tags/rights-by-country');
    expect(html).toContain('data-prerendered="hub-links"');
    expect(html).toContain('href="/country/germany"');
    expect(fetchRows).toHaveBeenCalledWith(
      expect.anything(),
      'countries',
      'slug,name',
      'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
      60,
      'name.asc,slug.asc',
    );
    expect(await buildHubLinksHtml({ ASSETS: { fetch } }, '/countries')).toBe('');
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });
});
