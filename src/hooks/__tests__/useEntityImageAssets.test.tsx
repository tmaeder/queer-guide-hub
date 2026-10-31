/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const q = {
      select: () => q,
      in: () => q,
      eq: () => q,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve),
    };
    return q;
  },
}));
import { useEntityImageAssets } from '../useEntityImageAssets';
const asset = (id: string, width: number, height: number) => ({
  entity_id: 'listing',
  role: 'cover',
  sort_order: 0,
  image_assets: {
    id,
    url: `https://cdn.example/${id}.jpg`,
    optimized_url: `https://img.queer.guide/${id}.jpg`,
    thumbnail_url: null,
    optimization_status: 'optimized',
    status: 'active',
    is_flagged: false,
    access_level: 'public',
    health_consecutive_failures: 0,
    width,
    height,
    brand_category: 'photography',
  },
});
beforeEach(() => {
  state.rows = [];
});
describe('useEntityImageAssets', () => {
  it('handles an empty entity list', () => {
    const { result } = renderHook(() => useEntityImageAssets('venue', []));
    expect(result.current.assets.size).toBe(0);
  });
  it('serves the exact database-approved image when several cover assets exist', async () => {
    state.rows = [asset('other', 1800, 1800), asset('approved', 800, 800)];
    const { result } = renderHook(() =>
      useEntityImageAssets(
        'marketplace_listing',
        ['listing'],
        [{ id: 'listing', subcategory_group: 'apparel', overview_image_asset_id: 'approved' }],
      ),
    );
    await waitFor(() => expect(result.current.assets.get('listing')?.id).toBe('approved'));
  });
  it('accepts a verified portrait book cover at 400 by 600', async () => {
    state.rows = [asset('book', 419, 640)];
    const { result } = renderHook(() =>
      useEntityImageAssets(
        'marketplace_listing',
        ['listing'],
        [{ id: 'listing', subcategory_group: 'books', overview_image_asset_id: 'book' }],
      ),
    );
    await waitFor(() => expect(result.current.assets.get('listing')?.id).toBe('book'));
  });
  it('retains the 600 by 600 floor for non-book products', async () => {
    state.rows = [asset('small', 419, 640)];
    const { result } = renderHook(() =>
      useEntityImageAssets(
        'marketplace_listing',
        ['listing'],
        [{ id: 'listing', subcategory_group: 'apparel', overview_image_asset_id: 'small' }],
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assets.size).toBe(0);
  });
  it('rejects a small book cover and a flagged book cover', async () => {
    const flagged = asset('flagged', 419, 640);
    flagged.image_assets.is_flagged = true;
    state.rows = [asset('small', 399, 640), flagged];
    const { result } = renderHook(() =>
      useEntityImageAssets(
        'marketplace_listing',
        ['listing'],
        [{ id: 'listing', subcategory_group: 'books' }],
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assets.size).toBe(0);
  });
});
