/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

/**
 * Let the async measurement resolve and React re-render.
 *
 * `waitFor(() => expect(x).toBeNull())` is USELESS for these cases: the cover
 * is null on the first render too, so the assertion passes instantly and the
 * test never observes the decision it exists to check. Verified — with the
 * width gate set to 0 the suite still passed 4/4. Flush, then assert.
 */
async function settleMeasurement() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const hero = {
  id: 'h1',
  slug: 'pride-essentials',
  title: 'Pride essentials',
  editor_blurb: null as string | null,
  cover_image_url: null as string | null,
};
const listings = [{ id: 'l1', title: 'A jockstrap', slug: 'a-jockstrap', images: [] as string[] }];

vi.mock('@/hooks/useMarketplaceCollections', () => ({
  useMarketplaceCollections: () => ({ collections: [hero], loading: false }),
  useMarketplaceCollectionListings: () => ({ listings, loading: false }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/marketplace/useCuratedIds', () => ({
  useCuratedIds: () => ({ register: () => {} }),
}));
vi.mock('@/components/marketplace/MarketplaceCard', () => ({ MarketplaceCard: () => <div /> }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  // A span, not an <a>: these tests care about which image is chosen, and a
  // bare anchor without href is a real a11y violation the linter rightly
  // rejects even in a stub.
  LocalizedLink: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/Image', () => ({
  Image: ({ src, alt }: { src?: string | null; alt: string }) => (
    <img data-testid="cover" src={src ?? ''} alt={alt} />
  ),
}));

import { MarketplaceHeroCover } from '../MarketplaceHeroCover';

/**
 * Stand in for the browser's image loader so a test can decide what a URL's
 * natural size is. The component measures rather than assumes, so the only way
 * to exercise it is to control the measurement.
 */
function stubImageLoader(widthByUrl: Record<string, number | 'error'>) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    set src(url: string) {
      const outcome = widthByUrl[url];
      queueMicrotask(() => {
        if (outcome === 'error' || outcome === undefined) this.onerror?.();
        else {
          this.naturalWidth = outcome;
          this.onload?.();
        }
      });
    }
  }
  vi.stubGlobal('Image', FakeImage as unknown as typeof window.Image);
}

describe('MarketplaceHeroCover fallback cover', () => {
  beforeEach(() => {
    hero.cover_image_url = null;
    listings[0].images = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses a listing image big enough to carry the plate', async () => {
    listings[0].images = ['https://cdn.example.com/big.jpg'];
    stubImageLoader({ 'https://cdn.example.com/big.jpg': 1200 });
    const { queryByTestId } = render(<MarketplaceHeroCover />);
    await waitFor(() =>
      expect(queryByTestId('cover')?.getAttribute('src')).toBe('https://cdn.example.com/big.jpg'),
    );
  });

  it('omits a thumbnail rather than magnifying it across the hero', async () => {
    // The real case: a misterb listing whose only surviving copy is 143x190,
    // rendered ~768px wide. An empty plate reads as a layout choice; a 5x
    // upscale reads as a broken site.
    listings[0].images = ['https://www.misterb.com/media/catalog/product/cache/abc/tiny.jpg'];
    stubImageLoader({ 'https://www.misterb.com/media/catalog/product/cache/abc/tiny.jpg': 143 });
    const { queryByTestId, getByText } = render(<MarketplaceHeroCover />);
    await settleMeasurement();
    // The section still renders — only the plate is dropped.
    expect(getByText('Pride essentials')).toBeTruthy();
    expect(queryByTestId('cover')).toBeNull();
  });

  it('never second-guesses a cover an editor chose', async () => {
    // `cover_image_url` is art-directed. Even if it were small, gating it would
    // be overriding a human decision with a heuristic.
    hero.cover_image_url = 'https://img.queer.guide/editorial/plate.jpg';
    listings[0].images = ['https://cdn.example.com/big.jpg'];
    stubImageLoader({});
    const { getByTestId } = render(<MarketplaceHeroCover />);
    expect(getByTestId('cover').getAttribute('src')).toBe(
      'https://img.queer.guide/editorial/plate.jpg',
    );
  });

  it('drops the plate when the fallback URL is dead', async () => {
    listings[0].images = ['https://www.misterb.com/gone.jpg'];
    stubImageLoader({ 'https://www.misterb.com/gone.jpg': 'error' });
    const { queryByTestId } = render(<MarketplaceHeroCover />);
    await settleMeasurement();
    expect(queryByTestId('cover')).toBeNull();
  });
});
