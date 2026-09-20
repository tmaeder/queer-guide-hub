/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within, expectNoNestedInteractive } from '@/test/test-utils';
import { Routes, Route } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children?: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

type Brand = {
  slug: string;
  display_name: string;
  logo_url: string | null;
  logo_on_ink: boolean | null;
  story: string | null;
  product_count: number | null;
  ownership_tags: string[] | null;
  cover_url: string | null;
  cover_thumb: string | null;
};

function brand(
  slug: string,
  name: string,
  count: number,
  opts: { tags?: string[]; cover?: boolean } = {},
): Brand {
  return {
    slug,
    display_name: name,
    logo_url: null,
    logo_on_ink: false,
    story: null,
    product_count: count,
    ownership_tags: opts.tags ?? [],
    // `cover_url` is the partition key for gallery vs index, so a fixture that
    // gave every maker one could not tell the two halves apart.
    cover_url: opts.cover === false ? null : `https://cdn.example/${slug}.jpg`,
    cover_thumb: null,
  };
}

// Deliberately NOT in product_count order for `Åberg`/`4Paws` — the A–Z branch
// has to do the sorting, and a pre-sorted fixture would pass either way.
// `zebra` and `fourpaws` carry NO cover: they are what proves a maker without
// a photograph stays reachable instead of being quietly dropped.
const DIRECTORY: Brand[] = [
  brand('big-maker', 'Big Maker', 7391),
  brand('mid-maker', 'Mid Maker', 900, { tags: ['queer_owned'] }),
  brand('zebra', 'Zebra Goods', 120, { cover: false }),
  brand('aberg', 'Åberg Atelier', 90),
  brand('fourpaws', '4Paws Supply', 40, { cover: false }),
];

const FEATURED = [
  {
    ...brand('big-maker', 'Big Maker', 7391),
    covers: [
      { url: 'https://cdn.example/1.jpg', thumb: null },
      { url: 'https://cdn.example/2.jpg', thumb: null },
      { url: 'https://cdn.example/3.jpg', thumb: null },
    ],
  },
];

const state = { directory: DIRECTORY, featured: FEATURED, loading: false };

vi.mock('@/hooks/useMarketplaceBrands', () => ({
  useMarketplaceBrandsDirectory: () => ({ data: state.directory, isLoading: state.loading }),
  useMarketplaceBrandCovers: () => ({ data: state.featured, isLoading: false }),
}));

import MarketplaceBrands from '../MarketplaceBrands';

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/marketplace/brands" element={<MarketplaceBrands />} />
    </Routes>,
    { route: '/marketplace/brands' },
  );
}

/** Maker names currently rendered, in DOM order. */
function renderedMakers(): string[] {
  return screen
    .getAllByRole('link')
    .map((a) => a.getAttribute('aria-label'))
    .filter((n): n is string => DIRECTORY.some((b) => b.display_name === n));
}

describe('MarketplaceBrands', () => {
  beforeEach(() => {
    state.directory = DIRECTORY;
    state.featured = FEATURED;
    state.loading = false;
  });

  it('renders the highlight band with the maker and its covers', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /On the counter today/i })).toBeInTheDocument();
    // One tile, three covers. The strip is aria-hidden, so query the DOM.
    expect(document.querySelectorAll('img[src*="cdn.example"]').length).toBeGreaterThanOrEqual(3);
  });

  it('never calls the highlight a ranking', () => {
    // The band rotates daily over everyone who qualifies, so "Most listings"
    // would be false and "Featured"/"Picks" would claim an editorial judgement
    // nobody made. This is the comment-outlives-its-data failure as copy.
    renderPage();
    const band = screen.getByRole('heading', { name: /On the counter today/i }).closest('section');
    expect(band).toBeTruthy();
    expect(band!.textContent).toMatch(/Not a ranking/i);
    expect(band!.textContent).not.toMatch(/most listings|featured|hand-?picked|curated/i);
  });

  it('does not repeat a highlighted maker in the catalogue below it', () => {
    // The floor is "every OTHER maker"; without the skip set, the head of the
    // catalogue renders twice on one screen.
    renderPage();
    expect(screen.getAllByRole('link', { name: 'Big Maker' })).toHaveLength(1);
  });

  it('splits the catalogue into a gallery and an index on the cover', () => {
    // The whole point of the rebuild: a maker WITH a photograph gets a tile, a
    // maker WITHOUT one gets a row. A gallery over everything would render the
    // coverless makers as boxes with a hole in them.
    renderPage();

    const gallery = screen.getByRole('link', { name: 'Mid Maker' }).closest('li');
    expect(within(gallery as HTMLElement).getByRole('presentation', { hidden: true })).toBeTruthy();

    // Zebra has no cover, so it must appear under the honest heading instead.
    expect(
      screen.getByRole('heading', { name: /Makers we have no photograph of/i }),
    ).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Zebra Goods' }).closest('li');
    expect(within(row as HTMLElement).queryByRole('presentation', { hidden: true })).toBeNull();
  });

  it('keeps a maker with no photograph reachable', () => {
    // A quarter of the catalogue has no product image. Dropping them from the
    // gallery view would silently shrink the directory and make them
    // unreachable from the page that exists to list every maker.
    renderPage();
    expect(screen.getByRole('link', { name: 'Zebra Goods' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '4Paws Supply' })).toBeInTheDocument();
  });

  it('reaches the photograph-less makers WITHOUT exhausting the gallery first', () => {
    // The defect this exists for: the two sections shared one budget, so the
    // index only began once the gallery ran out. On prod that is 657 makers at
    // 48 a page — FOURTEEN presses of "Show more" before the other 214 appear.
    // Reachable in principle, unreachable in practice, and indistinguishable
    // from dropping them entirely by looking at the page.
    //
    // The five-row fixture above cannot catch this: it never paginates. This
    // one is deliberately larger than one gallery step.
    state.directory = [
      ...Array.from({ length: 60 }, (_, i) =>
        brand(`photo-${i}`, `Photo Maker ${String(i).padStart(2, '0')}`, 500 - i),
      ),
      brand('no-photo-one', 'Unphotographed One', 10, { cover: false }),
    ];
    state.featured = [];
    renderPage();

    // The gallery is paginated — the precondition the defect needed.
    expect(screen.getByRole('button', { name: /more with photos/i })).toBeInTheDocument();

    // ...and the index is reachable anyway, on the very first screen.
    expect(
      screen.getByRole('heading', { name: /Makers we have no photograph of/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unphotographed One' })).toBeInTheDocument();
  });

  it('hides the highlight band once the reader searches', async () => {
    // The band is the head of the CATALOGUE, not of the RESULTS. Left up, it
    // puts twelve unrelated makers above a search for something else and reads
    // as though they were the answer.
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('heading', { name: /On the counter today/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search makers/i), 'zebra');

    expect(
      screen.queryByRole('heading', { name: /On the counter today/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zebra Goods' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mid Maker' })).not.toBeInTheDocument();
  });

  it('returns a filtered-out highlighted maker to the catalogue', async () => {
    // Searching removes the band, so its makers must rejoin the catalogue or
    // they become unreachable by the very search meant to find them.
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText(/Search makers/i), 'big');
    expect(screen.getByRole('link', { name: 'Big Maker' })).toBeInTheDocument();
  });

  it('shows the coverage note whenever an ownership chip is active', async () => {
    // Content-safety contract: 37 of 871 brands carry any ownership tag, so a
    // filtered list looks exhaustive and is not.
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText(/most carry no\s+ownership information/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Queer-owned/i }));

    expect(screen.getByText(/most carry no/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mid Maker' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Zebra Goods' })).not.toBeInTheDocument();
  });

  it('renders every maker as a row in the A–Z index, with no tiles', async () => {
    // The index is the LOOK-SOMETHING-UP form. A gallery cannot carry an
    // alphabetical index cleanly, and mixing the two would put the makers with
    // photographs in a different place from the ones without — under headings
    // that claim to cover the whole letter.
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'A–Z index' }));

    expect(
      screen.queryByRole('heading', { name: /Makers we have no photograph of/i }),
    ).not.toBeInTheDocument();
    // No gallery cover images outside the highlight band.
    const bandImages = document.querySelectorAll('section img[src*="cdn.example"]').length;
    expect(document.querySelectorAll('img[src*="cdn.example"]').length).toBe(bandImages);
  });

  it('only shows the letter bar in A–Z mode, and sorts alphabetically there', async () => {
    // A letter bucket is incoherent against a count ordering, and the bar
    // filters rather than jumps — left visible in the gallery it would silently
    // remove makers with no way to tell why.
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole('navigation', { name: /Jump to letter/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A–Z index' }));
    expect(screen.getByRole('navigation', { name: /Jump to letter/i })).toBeInTheDocument();

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Diacritics fold, so Åberg files at A and not in the "#" bucket; a name
    // starting with a digit does land there — and lands LAST, see below.
    expect(names).toEqual(['A', 'M', 'Z', '#']);
  });

  it('files the "#" bucket at the end of the index, not the front', async () => {
    // `localeCompare` alone sorts digits and symbols BEFORE "A", so the A–Z
    // view opened on "#" — which at the time was mostly merchant-feed ID
    // artifacts, i.e. the worst names in the catalogue at the top of the page.
    //
    // Asserted on the ROW order rather than only the headings: a heading list
    // still reads plausibly if the rows beneath it are interleaved, and the
    // rows are what the reader actually meets.
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'A–Z index' }));

    const rows = renderedMakers();
    expect(rows[rows.length - 1]).toBe('4Paws Supply');
    expect(rows.indexOf('Åberg Atelier')).toBeLessThan(rows.indexOf('4Paws Supply'));
  });

  it('clears a letter filter when switching back to the gallery', async () => {
    // The bar that set it unmounts, so a surviving letter filter removes makers
    // with nothing on screen explaining it.
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'A–Z index' }));
    await user.click(screen.getByRole('button', { name: 'Filter by Z' }));
    expect(screen.queryByRole('link', { name: 'Mid Maker' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gallery' }));
    expect(screen.getByRole('link', { name: 'Mid Maker' })).toBeInTheDocument();
  });

  it('puts no interactive element inside a tile or row link', () => {
    // Ownership badges live inside both, so each link has to be an absolute
    // overlay sibling — a wrapper is `nested-interactive` (axe serious, WCAG
    // 4.1.2).
    const { container } = renderPage();
    expectNoNestedInteractive(container);
  });

  it('offers a way out when nothing matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText(/Search makers/i), 'nothingmatchesthis');
    const empty = screen.getByText(/No makers match that/i);
    expect(empty).toBeInTheDocument();
    // Scoped to the empty state: the end-of-line band offers the same
    // destination, so an unscoped query matches two links and passes even if
    // the empty state loses its way out entirely.
    expect(within(empty.closest('p') as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/marketplace',
    );
  });
});
