/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expectNoNestedInteractive } from '@/test/test-utils';
import { OrganizationCard } from '../OrganizationCard';
import type { OrgListItem } from '@/hooks/useOrganization';

const ORG: OrgListItem = {
  id: 'o1',
  slug: 'helpline',
  name: 'Helpline',
  description: 'Support line',
  editorial_hook: null,
  logo_url: null,
  cover_image_url: null,
  roles: ['seller', 'support'],
  website_domain: 'helpline.org',
  city_id: null,
  country_id: null,
  founded_at: null,
  dissolved_at: '2019-03-01',
};

describe('OrganizationCard', () => {
  it('draws the role mark in the plate when there is no picture', () => {
    const { container } = render(
      <MemoryRouter>
        <OrganizationCard org={ORG} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
    expect(screen.getByText('Dissolved 2019')).toBeInTheDocument();
  });

  it('puts the highest-priority role mark on a badge when there is a logo', () => {
    const { container } = render(
      <MemoryRouter>
        <OrganizationCard org={{ ...ORG, logo_url: 'https://example.com/logo.png' }} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="lifebuoy"]')).not.toBeNull();
  });

  it('is one link to the organization page with nothing interactive nested in it', () => {
    const { container } = render(
      <MemoryRouter>
        <OrganizationCard org={ORG} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/organizations/helpline');
    expectNoNestedInteractive(container);
  });
});
