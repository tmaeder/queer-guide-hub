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
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OrgActions org={org} />
        <OrgLocationContact org={org} />
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
