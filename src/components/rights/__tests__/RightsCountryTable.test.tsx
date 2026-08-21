// src/components/rights/__tests__/RightsCountryTable.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { RightsCountryTable, type CountryFilter } from '../RightsCountryTable';
import type { RightsCountry } from '@/hooks/useIntentData';

const mk = (
  name: string,
  score: number | null,
  crim: Record<string, unknown> | null = { legal: true },
): RightsCountry => ({
  id: name,
  name,
  slug: name.toLowerCase().replace(/ /g, '-'),
  code: name.slice(0, 2).toUpperCase(),
  equality_score: score,
  lgbti_criminalization: crim,
  lgbti_same_sex_unions: null,
});

// 40 protected rows to exercise the 30-row window, plus one of each other kind.
const many = Array.from({ length: 40 }, (_, i) => mk(`Safeland ${String(i).padStart(2, '0')}`, 90));
const countries: RightsCountry[] = [
  ...many,
  mk('Midland', 60),
  mk('Grimland', 20),
  mk('Deathland', null, { legal: false, death_penalty: 'Yes' }),
  mk('Blankland', null, {}),
];

function Harness({ initial = 'all' }: { initial?: CountryFilter }) {
  const [filter, setFilter] = useState<CountryFilter>(initial);
  return (
    // RightsCountryTable links country names via LocalizedLink, which reads
    // router context (useLocation/useParams) — every other component test
    // that exercises LocalizedLink wraps in MemoryRouter (see GeoCard.test.tsx
    // etc.); `render` from test-utils is the raw testing-library render with
    // no Router, so this wrapper is required here for the same reason.
    <MemoryRouter>
      <RightsCountryTable countries={countries} filter={filter} onFilterChange={setFilter} />
    </MemoryRouter>
  );
}

describe('RightsCountryTable', () => {
  it('shows a 30-row window with a Show all expander', async () => {
    render(<Harness />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row').length).toBe(31); // header + 30
    await userEvent.click(screen.getByRole('button', { name: /show all 44/i }));
    expect(within(table).getAllByRole('row').length).toBe(45);
  });

  it('search narrows to matching countries', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('searchbox'), 'grim');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Grimland')).toBeInTheDocument();
    expect(within(table).queryByText('Midland')).toBeNull();
  });

  it('an unscored country is never listed under Protected', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Protected/ }));
    const table = screen.getByRole('table');
    expect(within(table).queryByText('Blankland')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Not scored/ }));
    expect(within(table).getByText('Blankland')).toBeInTheDocument();
  });

  it('criminalising filter shows only criminalising rows, with the death flag', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Criminalising/ }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Deathland')).toBeInTheDocument();
    expect(within(table).queryByText('Midland')).toBeNull();
    expect(within(table).getByText(/death penalty/)).toBeInTheDocument();
  });

  it('chips carry counts', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'All 44' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criminalising 1' })).toBeInTheDocument();
  });

  it('unscored rows print — not a number', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^Not scored/ }));
    const row = screen.getByText('Blankland').closest('tr')!;
    expect(row.textContent).toContain('—');
  });
});
