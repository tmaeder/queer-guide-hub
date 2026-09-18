/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/components/marketplace/MarketplaceMasthead', () => ({
  MarketplaceMasthead: (p: { title: string; count?: string }) => (
    <header>
      <h1>{p.title}</h1>
      <p data-testid="count">{p.count}</p>
    </header>
  ),
}));
vi.mock('@/components/layout/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const groupCounts = vi.fn();
const adultAck = vi.fn();
vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceSubcategoryGroupCounts: (...a: unknown[]) => groupCounts(...a),
}));
vi.mock('@/hooks/useAdultContent', () => ({
  useAdultAcknowledgement: () => adultAck(),
}));

import MarketplaceCategories from '../MarketplaceCategories';

/** Shape the hook returns: canonical `subcategory_group` slugs, never raw merchant slugs. */
function rows(...pairs: [string, number][]) {
  return { data: pairs.map(([slug, count]) => ({ slug, count })), loading: false };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MarketplaceCategories />
    </MemoryRouter>,
  );
}

function hrefs() {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  adultAck.mockReturnValue({ acknowledged: false });
});

describe('MarketplaceCategories', () => {
  it('reads the canonical group grain for ALL departments, not the raw merchant grain', () => {
    groupCounts.mockReturnValue(rows(['tops', 8403]));
    renderPage();
    // `null` = every department. `undefined` would mean "skip the fetch" and is
    // what the department page passes; passing it here renders an empty index.
    expect(groupCounts).toHaveBeenCalledWith(null, false);
  });

  it('links a group to its DEPARTMENT page scoped by ?g=, never to the bare group slug', () => {
    groupCounts.mockReturnValue(rows(['jockstraps', 1316]));
    renderPage();
    expect(hrefs()).toContain('/marketplace/category/underwear?g=jockstraps');
  });

  it('a group slug that COLLIDES with a department slug still links through ?g=', () => {
    // The regression this whole change exists to prevent. Six group slugs are
    // also department slugs (apparel, underwear, swimwear, jewelry, services,
    // other). Linking `underwear` to /marketplace/category/underwear renders the
    // DEPARTMENT page — 6,202 listings against the tile's own 4,278 — so the
    // number the reader clicked disagrees with the page they land on.
    groupCounts.mockReturnValue(rows(['underwear', 4278]));
    renderPage();
    const all = hrefs();
    expect(all).toContain('/marketplace/category/underwear?g=underwear');
    // The department link exists too, but only as the section's "All underwear"
    // link — never as the tile.
    const tile = screen.getByText('Underwear', { selector: 'span' }).closest('a');
    expect(tile?.getAttribute('href')).toBe('/marketplace/category/underwear?g=underwear');
  });

  it('labels come from the shared vocabulary, not a local prettify()', () => {
    groupCounts.mockReturnValue(rows(['home_goods', 419]));
    renderPage();
    // groupLabel gives "Home goods"; the deleted prettify() gave "Home Goods".
    expect(screen.getByText('Home goods')).toBeInTheDocument();
    expect(screen.queryByText('Home Goods')).not.toBeInTheDocument();
  });

  it('hides adult departments until the visitor has opted in', () => {
    groupCounts.mockReturnValue(rows(['tops', 8403], ['dildos', 1640], ['bondage', 2196]));
    renderPage();
    expect(screen.getByRole('heading', { name: 'Apparel' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Intimacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'BDSM & Fetish' })).not.toBeInTheDocument();
  });

  it('shows adult departments once acknowledged, and asks the RPC for them', () => {
    adultAck.mockReturnValue({ acknowledged: true });
    groupCounts.mockReturnValue(rows(['dildos', 1640]));
    renderPage();
    expect(groupCounts).toHaveBeenCalledWith(null, true);
    expect(screen.getByRole('heading', { name: 'Intimacy' })).toBeInTheDocument();
  });

  it('surfaces a group the client cannot route instead of silently dropping it', () => {
    // `apparel` was exactly this: a real SQL group with 782 SFW listings that was
    // missing from DEPARTMENT_GROUPS, so any naive iteration lost it without a
    // trace. It is routed now, so this uses a slug the mirror genuinely lacks.
    groupCounts.mockReturnValue(rows(['tops', 8403], ['brand_new_sql_group', 42]));
    renderPage();
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument();
    expect(hrefs()).toContain('/marketplace?grp=brand_new_sql_group');
  });

  it('counts stops across departments, not raw merchant categories', () => {
    groupCounts.mockReturnValue(rows(['tops', 8403], ['bottoms', 2375], ['books', 7674]));
    renderPage();
    // 3 groups over 2 departments (apparel, books_art).
    expect(screen.getByTestId('count')).toHaveTextContent('3 categories in 2 departments');
  });

  it('renders an empty state rather than an empty grid', () => {
    groupCounts.mockReturnValue({ data: [], loading: false });
    renderPage();
    expect(screen.getByText(/No categories yet/i)).toBeInTheDocument();
  });
});
