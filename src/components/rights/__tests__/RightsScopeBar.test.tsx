// src/components/rights/__tests__/RightsScopeBar.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { RightsScopeBar } from '../RightsScopeBar';
import type { RightsCountry } from '@/hooks/useIntentData';

const navigateMock = vi.fn();
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => navigateMock,
}));

const mk = (name: string, over: Partial<RightsCountry> = {}): RightsCountry => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  code: name.slice(0, 2).toUpperCase(),
  equality_score: 90,
  lgbti_criminalization: { legal: true },
  lgbti_same_sex_unions: null,
  ...over,
});

const countries = [mk('Andorra'), mk('Belgium'), mk('Chile')];

// RightsScopeBar links to a country via LocalizedLink and navigates via
// useLocalizedNavigate, both of which read router context — every other
// component test that exercises LocalizedLink wraps in MemoryRouter (see
// RightsCountryTable.test.tsx); `render` from test-utils has no Router.
function renderBar(ui: Parameters<typeof render>[0]) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('RightsScopeBar', () => {
  it('renders the three headline stats', () => {
    renderBar(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 66, deathConfirmed: 7, marriage: 67 }}
        onShowCriminalising={() => {}}
      />,
    );
    expect(screen.getByText('66')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('67')).toBeInTheDocument();
  });

  it('navigates to the picked country', async () => {
    renderBar(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 0, deathConfirmed: 0, marriage: 0 }}
        onShowCriminalising={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: /check a country/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Belgium' }));
    expect(navigateMock).toHaveBeenCalledWith('/country/belgium');
  });

  it('states the here-verdict for a located visitor', () => {
    renderBar(
      <RightsScopeBar
        countries={countries}
        here={mk('Switzerland')}
        stats={{ criminalising: 0, deathConfirmed: 0, marriage: 0 }}
        onShowCriminalising={() => {}}
      />,
    );
    expect(screen.getByText(/You’re in/)).toBeInTheDocument();
    expect(screen.getByText(/not criminalised/)).toBeInTheDocument();
  });

  it('death tile presets the criminalising view', async () => {
    const onShow = vi.fn();
    renderBar(
      <RightsScopeBar
        countries={countries}
        here={null}
        stats={{ criminalising: 66, deathConfirmed: 7, marriage: 67 }}
        onShowCriminalising={onShow}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /66.*criminalise/is }));
    expect(onShow).toHaveBeenCalledWith('criminalising');
    await userEvent.click(screen.getByRole('button', { name: /7.*death penalty/is }));
    expect(onShow).toHaveBeenCalledWith('death');
  });
});
