/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Organization } from '@/hooks/useOrganization';

vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/components/map/NearbyMapLegend', () => ({ NearbyMapLegend: () => null }));
vi.mock('@/hooks/useNearbyMapPoints', () => ({ useNearbyMapPoints: () => [] }));
vi.mock('@/components/share/ShareMenu', () => ({ ShareMenu: () => <button>Share</button> }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: { contentType: string; contentId: string; exportable?: boolean }) => (
    <span
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-exportable={String(Boolean(p.exportable))}
    />
  ),
}));

import { OrgActions, OrgLocationContact } from '../OrganizationDetail.parts';

const WEBSITE = 'https://acme.example/';

const org: Organization = {
  id: 'o1',
  slug: 'acme',
  name: 'Acme',
  legal_name: null,
  description: null,
  editorial_hook: null,
  editorial_long: null,
  logo_url: null,
  cover_image_url: null,
  images: [],
  roles: ['venue', 'seller'],
  website: WEBSITE,
  website_domain: 'acme.example',
  email: 'hi@acme.example',
  phone: null,
  // The registry's catch-all `website` key — the copy that used to render the
  // homepage a second time in the social row.
  social: { website: WEBSITE, instagram: 'https://instagram.com/acme' },
  tags: [],
  city_id: null,
  country_id: null,
  article_count: 0,
  product_count: 0,
  venue_count: 1,
  venues: [
    {
      id: 'v1',
      slug: 'acme-bar',
      name: 'Acme Bar',
      city: 'Berlin',
      latitude: 52.5,
      longitude: 13.4,
      image_url: null,
    },
  ],
};

function renderPage(o: Organization = org) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OrgActions org={o} />
        <OrgLocationContact org={o} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('organization page — website renders once', () => {
  it('links the website exactly once, in Location & contact, with nofollow', () => {
    const { container } = renderPage();
    const links = [...container.querySelectorAll('a')].filter((a) =>
      a.getAttribute('href')?.includes('acme.example/'),
    );
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('rel')).toContain('nofollow');
    expect(links[0].textContent).toBe('acme.example');
    // Positive control: the social row did render — the website was excluded
    // from it, not the whole row lost.
    expect(container.querySelector('a[href*="instagram.com"]')).not.toBeNull();
  });

  it('lists the venue it runs', () => {
    const { container } = renderPage();
    expect(container.querySelector('a[href*="/venues/acme-bar"]')).not.toBeNull();
  });
});

describe('organization page — contact lines', () => {
  const withVenuePhone: Organization = {
    ...org,
    venues: [{ ...org.venues[0], phone: '+492012488403' }],
  };

  it("falls back to the primary venue's phone when the organisation has none", () => {
    const { container } = renderPage(withVenuePhone);
    expect(container.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe(
      'tel:+492012488403',
    );
  });

  it("prefers the organisation's own phone", () => {
    const { container } = renderPage({ ...withVenuePhone, phone: '+4930123456' });
    expect(container.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe(
      'tel:+4930123456',
    );
  });

  it('renders no phone line when neither has one', () => {
    const { container } = renderPage();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('puts the phone directly under the email', () => {
    const { container } = renderPage(withVenuePhone);
    const order = [...container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => /^(mailto:|tel:|https:\/\/acme)/.test(h))
      .map((h) => h.split(':')[0]);
    expect(order).toEqual(['mailto', 'tel', 'https']);
  });

  it('centres each contact link on its icon (links are 44px-tall blocks)', () => {
    const { container } = renderPage(withVenuePhone);
    for (const sel of ['a[href^="mailto:"]', 'a[href^="tel:"]', 'a[href^="https://acme"]']) {
      const cls = container.querySelector(sel)?.className ?? '';
      expect(cls).toMatch(/\bflex\b/);
      expect(cls).toMatch(/\bitems-center\b/);
    }
  });

  it('opts the organization admin menu into the record export', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <OrgActions org={org} />
      </MemoryRouter>,
    );
    const btn = getByTestId('admin-edit');
    expect(btn).toHaveAttribute('data-type', 'organizations');
    expect(btn).toHaveAttribute('data-id', 'o1');
    expect(btn).toHaveAttribute('data-exportable', 'true');
  });
});
