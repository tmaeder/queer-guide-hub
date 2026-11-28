/**
 * @vitest-environment jsdom
 *
 * Optional editor-entered fields, round 2: event admission/dress code (and the
 * existing price/end date/age in the decision summary), marketplace service
 * facts, village visit facts, podcast "Listen on" links and the news story
 * summary editor. Each renders only when filled.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ReactNode } from 'react';

vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/marketplace/MarketplacePriceHistory', () => ({
  MarketplacePriceHistory: () => null,
}));
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => null }));
const roles = vi.hoisted(() => ({ isAdmin: false, isModerator: false, isEditor: false }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => roles }));

import { EventFactStrip, type EventWithRelations } from '../EventDetail.parts';
import { ProductFacts, type MarketplaceListing } from '../MarketplaceItemDetail.parts';
import { VillageVisitFacts, type VillageWithRelations } from '../QueerVillageDetail.parts';
import { ListenOnLinks } from '@/components/podcasts/ListenOnLinks';
import { StorySummaryEditor } from '@/components/news/StorySummaryEditor';

const t = ((_k: string, d?: string) => d ?? _k) as never;

describe('event decision summary facts', () => {
  const base = {
    id: 'e1',
    start_date: '2030-06-01T20:00:00Z',
    end_date: null,
    timezone: null,
    is_free: false,
    price_min: null,
    price_max: null,
    currency: 'EUR',
    age_restriction: null,
    max_attendees: null,
    admission_rules: null,
    dress_code: null,
  } as unknown as EventWithRelations;
  const strip = (e: Partial<EventWithRelations>) =>
    renderWithProviders(
      <EventFactStrip event={{ ...base, ...e }} showEventTz={false} setShowEventTz={() => {}} />,
    );

  it('renders admission, dress code, price range, age and end date when filled', () => {
    strip({
      admission_rules: 'Members only',
      dress_code: 'Leather',
      price_min: 10,
      price_max: 20,
      age_restriction: '18+',
      end_date: '2030-06-03T04:00:00Z',
    });
    expect(screen.getByText('Members only')).toBeTruthy();
    expect(screen.getByText('Leather')).toBeTruthy();
    expect(screen.getByText(/10.*20/)).toBeTruthy();
    expect(screen.getByText('18+')).toBeTruthy();
    // Multi-day: the date fact spans start to end.
    expect(screen.getByText(/1.*3|Jun 1.*Jun 3/)).toBeTruthy();
  });

  it('renders a max-only price', () => {
    strip({ price_max: 25 });
    expect(screen.getByText(/Up to/)).toBeTruthy();
  });

  it('omits admission and dress code when empty', () => {
    strip({});
    expect(screen.queryByText('Admission')).toBeNull();
    expect(screen.queryByText('Dress code')).toBeNull();
  });
});

describe('marketplace service facts', () => {
  const listing = {
    id: 'l1',
    department: 'services',
    brand: null,
    in_stock: null,
    availability: 'unknown',
    location: null,
    attributes: {},
    content_rating: 'sfw',
  } as unknown as MarketplaceListing;
  it('renders when filled', () => {
    renderWithProviders(
      <ProductFacts
        listing={{
          ...listing,
          event_date: '2030-07-04T18:00:00Z',
          billing_interval: 'month',
          recipient: 'Trans Lifeline',
        }}
      />,
    );
    expect(screen.getByText('Event date')).toBeTruthy();
    expect(screen.getByText('Billed monthly')).toBeTruthy();
    expect(screen.getByText('Trans Lifeline')).toBeTruthy();
  });
  it('is absent when empty', () => {
    renderWithProviders(
      <ProductFacts
        listing={{ ...listing, event_date: null, billing_interval: null, recipient: null }}
      />,
    );
    expect(screen.queryByText('Event date')).toBeNull();
    expect(screen.queryByText('Billing')).toBeNull();
    expect(screen.queryByText('Donation goes to')).toBeNull();
  });
});

describe('village visit facts', () => {
  const village = { id: 'v1' } as unknown as VillageWithRelations;
  it('renders when filled', () => {
    render(
      <VillageVisitFacts
        village={{ ...village, best_time_to_visit: 'Pride week', suits: 'Bar crawls' }}
        t={t}
      />,
    );
    expect(screen.getByText('Pride week')).toBeTruthy();
    expect(screen.getByText('Bar crawls')).toBeTruthy();
  });
  it('renders nothing when empty', () => {
    const { container } = render(
      <VillageVisitFacts village={{ ...village, best_time_to_visit: null, suits: '  ' }} t={t} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('podcast listen-on links', () => {
  it('lists only filled platforms, opening in a new tab', () => {
    renderWithProviders(
      <ListenOnLinks
        show={{
          apple_podcasts_url: null,
          spotify_url: 'https://open.spotify.com/show/x',
          youtube_url: null,
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /Spotify/ });
    expect(link.getAttribute('href')).toBe('https://open.spotify.com/show/x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByText('Apple Podcasts')).toBeNull();
  });
  it('renders nothing when none are filled', () => {
    const { container } = renderWithProviders(
      <ListenOnLinks show={{ apple_podcasts_url: null, spotify_url: null, youtube_url: null }} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('news story summary editor', () => {
  it('is hidden for readers', () => {
    const { container } = renderWithProviders(
      <StorySummaryEditor storyId="s1" summary={null} onSaved={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });
  it('offers editors an add/edit control', () => {
    roles.isEditor = true;
    renderWithProviders(<StorySummaryEditor storyId="s1" summary={null} onSaved={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add summary' })).toBeTruthy();
    roles.isEditor = false;
  });
});
