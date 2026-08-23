/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * WHAT CHANGED HERE, AND WHY THE OLD CONTRACT IS GONE.
 *
 * #3033 measured a real defect: the hero plate renders ~768-900 CSS px, and a
 * misterb listing whose only surviving copy is 143x190 was being magnified 5.4x
 * across the most prominent element on the page. It fixed that by MEASURING the
 * stand-in and refusing anything under 800px wide — making the fallback safe.
 *
 * This suite now encodes a stricter rule that subsumes it: the first pick's
 * product photograph is never the cover at ANY size, because a cover has to
 * describe a SET and a product shot describes one member of it. On prod that
 * arm was not a fallback at all — no collection has ever had a
 * `cover_image_url`, so it WAS the behaviour, and it put a leather vest on
 * "Pride essentials".
 *
 * So the "uses a listing image big enough to carry the plate" case is deleted
 * rather than adjusted — it asserts a behaviour that must not happen now. What
 * replaces it is the inverse, plus the thing #3033 could not offer: the empty
 * slot is no longer empty. Its own two "the plate is dropped" cases survive
 * with a STRONGER assertion — not merely "no product photo" but "a drawn plate
 * is there instead", which is what stops the hero collapsing to a title beside
 * a blank column. The 800px constant itself is untouched in
 * `_shared/image-gate.ts` as `COVER_MIN_W`, which is where that finding still
 * does work.
 *
 * The `stubImageLoader` / `settleMeasurement` helpers went with the probe:
 * there is no measurement left to control or to flush.
 */

const hero = {
  id: 'h1',
  slug: 'pride-essentials',
  title: 'Pride essentials',
  editor_blurb: null as string | null,
  cover_image_url: null as string | null,
  item_count: 4,
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
  // A span, not an <a>: these tests care about which cover is chosen, and a
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

describe('MarketplaceHeroCover', () => {
  beforeEach(() => {
    hero.cover_image_url = null;
    hero.item_count = 4;
    listings[0].images = [];
  });

  it('never uses a listing photograph as the collection cover, however large', () => {
    // 1200px clears every size bar #3033 could set. It is still refused: the
    // objection is semantic, not about resolution.
    listings[0].images = ['https://cdn.example.com/big.jpg'];
    const { queryByTestId } = render(<MarketplaceHeroCover />);
    expect(queryByTestId('cover')).toBeNull();
  });

  it('draws a plate instead of leaving the slot empty', () => {
    listings[0].images = ['https://www.misterb.com/media/catalog/product/cache/abc/tiny.jpg'];
    const { container, getByText, queryByTestId } = render(<MarketplaceHeroCover />);
    expect(getByText('Pride essentials')).toBeTruthy();
    expect(queryByTestId('cover')).toBeNull();
    // The stronger half: something is actually drawn there. One station per
    // pick, so a 4-item collection gets four rings.
    const rings = container.querySelectorAll('svg circle');
    expect(rings.length).toBe(4);
  });

  it('never second-guesses a cover an editor chose', () => {
    // `cover_image_url` is art-directed. Gating it would be overriding a human
    // decision with a heuristic — still true, and still the first branch.
    hero.cover_image_url = 'https://img.queer.guide/editorial/plate.jpg';
    listings[0].images = ['https://cdn.example.com/big.jpg'];
    const { getByTestId, container } = render(<MarketplaceHeroCover />);
    expect(getByTestId('cover').getAttribute('src')).toBe(
      'https://img.queer.guide/editorial/plate.jpg',
    );
    // ...and the plate is NOT drawn underneath it.
    expect(container.querySelectorAll('svg circle').length).toBe(0);
  });

  it('draws the plate even when the collection has no usable listing image at all', () => {
    // The dead-URL case #3033 guarded. It no longer depends on the URL being
    // reachable, because the URL is never requested for this slot.
    listings[0].images = [];
    const { container, queryByTestId } = render(<MarketplaceHeroCover />);
    expect(queryByTestId('cover')).toBeNull();
    expect(container.querySelectorAll('svg circle').length).toBe(4);
  });
});
