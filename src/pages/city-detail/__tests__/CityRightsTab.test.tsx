/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/country/LGBTJurisdictionInfo', () => ({
  default: () => <div data-testid="rights" />,
}));
// CountryLegalHistory runs a real useQuery (useMilestonesForCountry); stub it so
// the tab test needs no QueryClientProvider.
vi.mock('@/components/country/CountryLegalHistory', () => ({
  CountryLegalHistory: () => <div data-testid="legal-history" />,
}));

import { CityRightsTab } from '../CityRightsTab';

const city = {
  name: 'Berlin',
  safety_notes: 'Generally very safe.',
  countries: { name: 'Germany', equality_score: 80, slug: 'germany', id: 'co-de' },
} as never;

// The inline CityMilestones block runs a real useQuery (useMilestonesForCity),
// so the tree needs a QueryClient; queries stay idle (no fetch assertions here).
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
const inRouter = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe('CityRightsTab', () => {
  it('shows loading state', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={null} countryLoading />));
    expect(screen.getByText(/Loading rights data/i)).toBeInTheDocument();
  });

  it('shows not-available message when fullCountry null', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={null} countryLoading={false} />));
    expect(screen.getByText(/Rights data is not available/i)).toBeInTheDocument();
  });

  it('renders city safety notes + jurisdiction info', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={{ id: 'co-de' } as never} countryLoading={false} />));
    expect(screen.getByText(/Generally very safe/i)).toBeInTheDocument();
    expect(screen.getByTestId('rights')).toBeInTheDocument();
  });
});
