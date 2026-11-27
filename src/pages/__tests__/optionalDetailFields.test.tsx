/**
 * @vitest-environment jsdom
 *
 * The optional editor-entered detail fields (venues.audience/languages,
 * organizations.eligibility/cost, hotels.room_count/max_guests, marketplace
 * book_format/book_language/publisher) render only when filled.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/marketplace/MarketplacePriceHistory', () => ({
  MarketplacePriceHistory: () => null,
}));

import { VenueFacts } from '../VenueDetail.parts';
import { HotelSidebar } from '../HotelDetail.parts';
import { OrgServiceSummary } from '../OrganizationDetail.parts';
import { ProductFacts, type MarketplaceListing } from '../MarketplaceItemDetail.parts';
import type { Organization } from '@/hooks/useOrganization';

const t = ((_k: string, d?: string) => d ?? _k) as never;

describe('venue audience + languages', () => {
  const venue = { id: 'v1', cities: { name: 'Berlin' }, countries: { name: 'Germany' } };
  it('renders both when filled', () => {
    render(
      <VenueFacts
        venue={{ ...venue, audience: ['women', 'trans'], languages: ['de'] } as never}
        t={t}
      />,
    );
    expect(screen.getByText('Women, Trans people')).toBeTruthy();
    expect(screen.getByText('German')).toBeTruthy();
  });
  it('renders nothing when empty', () => {
    const { container } = render(
      <VenueFacts venue={{ ...venue, audience: null, languages: [] } as never} t={t} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('hotel rooms + max guests', () => {
  const hotel = { id: 'h1', name: 'Pride Hotel', images: [] };
  it('renders when filled', () => {
    render(<HotelSidebar hotel={{ ...hotel, room_count: 12, max_guests: 30 } as never} t={t} />);
    expect(screen.getByText('Rooms')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Max guests')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });
  it('is absent when empty', () => {
    render(
      <HotelSidebar hotel={{ ...hotel, room_count: null, max_guests: null } as never} t={t} />,
    );
    expect(screen.queryByText('Rooms')).toBeNull();
    expect(screen.queryByText('Max guests')).toBeNull();
  });
});

describe('organization eligibility + cost', () => {
  const org = {
    id: 'o1',
    slug: 'o',
    name: 'Org',
    roles: ['publisher'],
    tags: [],
  } as unknown as Organization;
  it('renders when filled', () => {
    render(
      <OrgServiceSummary org={{ ...org, eligibility: 'Trans people under 25', cost: 'Free' }} />,
    );
    expect(screen.getByText('Trans people under 25')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });
  it('is absent when empty', () => {
    const { container } = render(
      <OrgServiceSummary org={{ ...org, eligibility: null, cost: null }} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('marketplace book fields', () => {
  const listing = {
    id: 'l1',
    department: 'books_art',
    brand: null,
    in_stock: true,
    availability: 'in_stock',
    location: null,
    attributes: {},
    content_rating: 'sfw',
  } as unknown as MarketplaceListing;
  it('renders when filled', () => {
    render(
      <ProductFacts
        listing={{
          ...listing,
          book_format: 'Paperback',
          book_language: 'fr',
          publisher: 'Gallimard',
        }}
      />,
    );
    expect(screen.getByText('Paperback')).toBeTruthy();
    expect(screen.getByText('French')).toBeTruthy();
    expect(screen.getByText('Gallimard')).toBeTruthy();
  });
  it('is absent when empty', () => {
    render(
      <ProductFacts
        listing={{ ...listing, book_format: null, book_language: null, publisher: null }}
      />,
    );
    expect(screen.queryByText('Format')).toBeNull();
    expect(screen.queryByText('Publisher')).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
  });
});
