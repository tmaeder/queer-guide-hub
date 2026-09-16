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
};

function brand(slug: string, name: string, count: number, tags: string[] = []): Brand {
  return {
    slug,
    display_name: name,
    logo_url: null,
    logo_on_ink: false,
    story: null,
    product_count: count,
    ownership_tags: tags,
  };
}

// Deliberately NOT in product_count order for `Åberg`/`4Paws` — the A–Z branch
// has to do the sorting, and a pre-sorted fixture would pass either way.
const DIRECTORY: Brand[] = [
  brand('big-maker', 'Big Maker', 7391),
  brand('mid-maker', 'Mid Maker', 900, ['queer_owned']),
  brand('zebra', 'Zebra Goods', 120),
  brand('aberg', 'Åberg Atelier', 90),
  brand('fourpaws', '4Paws Supply', 40),
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

describe('MarketplaceBrands', () => {
  beforeEach(() => {
    state.directory = DIRECTORY;
    state.featured = FEATURED;
    state.loading = false;
  });

  it('renders the counter band with the maker and its covers', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Most listings/i })).toBeInTheDocument();
    // One tile, three covers. The strip is aria-hidden, so query the DOM.
    expect(document.querySelectorAll('img[src*="cdn.example"]').length).toBeGreaterThanOrEqual(3);
  });

  it('does not repeat a featured maker in the index below it', () => {
    // The floor is "every OTHER maker"; without the skip set, the head of the
    // catalogue renders twice on one screen.
    renderPage();
    expect(screen.getAllByRole('link', { name: 'Big Maker' })).toHaveLength(1);
  });

  it('hides the counter band once the reader searches', async () => {
    // The band is the head of the CATALOGUE, not of the RESULTS. Left up, it
    // puts twelve unrelated makers above a search for something else and reads
    // as though they were the answer.
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('heading', { name: /Most listings/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search makers/i), 'zebra');

    expect(screen.queryByRole('heading', { name: /Most listings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zebra Goods' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mid Maker' })).not.toBeInTheDocument();
  });

  it('returns a filtered-out featured maker to the index', async () => {
    // Searching removes the counter, so its makers must rejoin the floor or
    // they become unreachable by the very search meant to find them.
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText(/Search makers/i), 'big');
    expect(screen.getByRole('link', { name: 'Big Maker' })).toBeInTheDocument();
  });

  it('shows the coverage note whenever an ownership chip is active', async () => {
    // Content-safety contract: 37 of 885 brands carry any ownership tag, so a
    // filtered list looks exhaustive and is not.
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText(/most carry no\s+ownership information/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Queer-owned/i }));

    expect(screen.getByText(/most carry no/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mid Maker' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Zebra Goods' })).not.toBeInTheDocument();
  });

  it('only shows the letter bar in A–Z mode, and sorts alphabetically there', async () => {
    // A letter bucket is incoherent against a count ordering, and the bar
    // filters rather than jumps — left visible under "Most listings" it would
    // silently remove rows with no way to tell why.
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole('navigation', { name: /Jump to letter/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(screen.getByRole('navigation', { name: /Jump to letter/i })).toBeInTheDocument();

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Diacritics fold, so Åberg files at A and not in the "#" bucket; a name
    // starting with a digit does land there — and lands LAST, see below.
    expect(names).toEqual(['A', 'M', 'Z', '#']);
  });

  it('files the "#" bucket at the end of the index, not the front', async () => {
    // `localeCompare` alone sorts digits and symbols BEFORE "A", so the A–Z
    // view opened on "#". On prod that bucket is 15 brands of which 13 are
    // merchant-feed ID artifacts ("12807-203758186"), so switching to A–Z
    // promoted the worst names in the catalogue to the top of the page.
    //
    // Asserted on the ROW order rather than only the headings: a heading list
    // still reads plausibly if the rows beneath it are interleaved, and the
    // rows are what the reader actually meets.
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'A–Z' }));

    const rows = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('aria-label'))
      .filter((n): n is string => DIRECTORY.some((b) => b.display_name === n));

    expect(rows[rows.length - 1]).toBe('4Paws Supply');
    expect(rows.indexOf('Åberg Atelier')).toBeLessThan(rows.indexOf('4Paws Supply'));
  });

  it('clears a letter filter when switching back to the count ordering', async () => {
    // The bar that set it unmounts, so a surviving letter filter removes rows
    // with nothing on screen explaining it.
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    await user.click(screen.getByRole('button', { name: 'Filter by Z' }));
    expect(screen.queryByRole('link', { name: 'Mid Maker' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Most listings' }));
    expect(screen.getByRole('link', { name: 'Mid Maker' })).toBeInTheDocument();
  });

  it('puts no interactive element inside the row link', () => {
    // Ownership badges live inside the row, so the link has to be an absolute
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
