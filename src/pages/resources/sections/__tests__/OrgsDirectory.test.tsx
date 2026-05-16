/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSupportOrgsMock, useUserCountryMock } = vi.hoisted(() => ({
  useSupportOrgsMock: vi.fn(),
  useUserCountryMock: vi.fn(),
}));

vi.mock('@/hooks/useResourceTopic', () => ({ useSupportOrgs: useSupportOrgsMock }));
vi.mock('@/hooks/useUserCountry', () => ({
  useUserCountry: useUserCountryMock,
  SUPPORTED_COUNTRIES: { INT: 'International', DE: 'Germany' },
  countryLabel: (c: string) => c,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/venues/VenueCard', () => ({
  VenueCard: (p: { venue: { id: string; name?: string } }) => <div data-testid="venue">{p.venue.name}</div>,
}));

import { OrgsDirectory } from '../OrgsDirectory';

beforeEach(() => {
  useSupportOrgsMock.mockReset();
  useUserCountryMock.mockReset();
  useUserCountryMock.mockReturnValue({ country: 'INT', setCountry: vi.fn() });
});

describe('OrgsDirectory', () => {
  it('shows skeletons while loading', () => {
    useSupportOrgsMock.mockReturnValue({ data: [], isLoading: true });
    const { container } = render(<OrgsDirectory />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('shows empty message when no orgs', () => {
    useSupportOrgsMock.mockReturnValue({ data: [], isLoading: false });
    render(<OrgsDirectory />);
    expect(screen.getByText(/No support organisations/)).toBeInTheDocument();
  });

  it('renders up to 8 venues', () => {
    useSupportOrgsMock.mockReturnValue({
      data: Array.from({ length: 12 }).map((_, i) => ({ id: String(i), name: `V${i}`, country: 'Germany' })),
      isLoading: false,
    });
    render(<OrgsDirectory />);
    expect(screen.getAllByTestId('venue').length).toBeLessThanOrEqual(8);
  });

  it('Browse all link is present', () => {
    useSupportOrgsMock.mockReturnValue({ data: [], isLoading: false });
    render(<OrgsDirectory />);
    expect(screen.getByRole('link', { name: /Browse all organisations/ })).toHaveAttribute('href', '/venues?category=community_center');
  });
});
