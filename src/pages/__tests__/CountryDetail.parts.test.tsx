/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// CountryLegalHistory runs a real useQuery (useMilestonesForCountry); stub it so
// the tab test needs no QueryClientProvider.
vi.mock('@/components/country/CountryLegalHistory', () => ({
  CountryLegalHistory: () => <div data-testid="legal-history" />,
}));

import { SectionLoader, CountryRightsTab, CountryCitiesTab } from '../CountryDetail.parts';

describe('CountryDetail.parts', () => {
  it('SectionLoader renders', () => {
    const { container } = render(<SectionLoader label="loading" />);
    expect(container).toBeTruthy();
  });

  it('CountryRightsTab renders', () => {
    const { container } = render(<CountryRightsTab country={{} as never} />);
    expect(container).toBeTruthy();
  });

  it('CountryCitiesTab shows empty state with no cities', () => {
    const { getByText } = render(
      <MemoryRouter>
        <CountryCitiesTab
          cities={[] as never}
          citiesLoading={false}
          emptyTitle="No cities yet"
          emptyDescription="None listed."
        />
      </MemoryRouter>,
    );
    expect(getByText('No cities yet')).toBeTruthy();
  });
});
