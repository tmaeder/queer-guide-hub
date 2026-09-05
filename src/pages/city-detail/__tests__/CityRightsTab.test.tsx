/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/country/LGBTJurisdictionInfo', () => ({
  default: () => <div data-testid="rights" />,
}));
// The legal line runs two real useQuerys (country + city milestones). Stub the
// hooks rather than the component so the fusion still runs against the country
// row — that join is the point of the block.
vi.mock('@/hooks/useMilestones', () => ({
  useMilestonesForCountry: () => ({ data: [] }),
  useMilestonesForCity: () => ({ data: [] }),
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
    render(
      inRouter(
        <CityRightsTab city={city} fullCountry={{ id: 'co-de' } as never} countryLoading={false} />,
      ),
    );
    expect(screen.getByText(/Generally very safe/i)).toBeInTheDocument();
    expect(screen.getByTestId('rights')).toBeInTheDocument();
  });

  it('renders ONE legal record, not the two duplicated blocks it replaced', () => {
    // `CityMilestones` was a copy of `CountryLegalHistory` and said so in a
    // comment; both stacked here, and neither knew about the adoption years
    // the rights card above was already printing.
    render(
      inRouter(
        <CityRightsTab
          city={city}
          fullCountry={
            {
              id: 'co-de',
              name: 'Germany',
              lgbti_same_sex_unions: JSON.stringify({ marriage_since: '2017' }),
            } as never
          }
          countryLoading={false}
        />,
      ),
    );
    expect(screen.getAllByRole('heading', { name: /legal record/i })).toHaveLength(1);
    expect(screen.queryByText(/Queer history in/i)).not.toBeInTheDocument();
  });

  it('shows an adoption year even when the country has no milestone rows', () => {
    // The old blocks read milestones only, so a country whose whole legal
    // record lives on the rights columns rendered nothing at all.
    render(
      inRouter(
        <CityRightsTab
          city={city}
          fullCountry={
            {
              id: 'co-de',
              name: 'Germany',
              lgbti_same_sex_unions: JSON.stringify({ marriage_since: '2017' }),
            } as never
          }
          countryLoading={false}
        />,
      ),
    );
    expect(screen.getByText('2017')).toBeInTheDocument();
  });
});
