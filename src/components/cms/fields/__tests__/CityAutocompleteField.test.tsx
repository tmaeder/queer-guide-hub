/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useAddressResolver', () => ({
  useAddressResolver: () => ({ resolveAddress: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { CityAutocompleteField } from '../CityAutocompleteField';
import { listFromWhere } from '@/hooks/usePageFetchers';

const field = { name: 'city', label: 'City', type: 'city_autocomplete' } as never;

describe('CityAutocompleteField', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(listFromWhere).mockReset().mockResolvedValue([]);
  });

  it('resolves a linked city outside the country list page', async () => {
    const selected = {
      id: 'springfield',
      name: 'Springfield',
      country_id: 'us',
      region_code: 'US-MA',
      countries: { name: 'United States', code: 'US' },
    };
    vi.mocked(listFromWhere).mockImplementation(async (_table, _select, filters) =>
      filters.some((filter) => filter.col === 'id' && filter.val === selected.id)
        ? [selected]
        : [{ ...selected, id: 'albany', name: 'Albany', region_code: 'US-NY' }],
    );
    render(
      <CityAutocompleteField
        field={
          {
            ...(field as object),
            relatedFields: { city_id: 'city_id', country_id: 'country_id' },
          } as never
        }
        value={undefined}
        onChange={vi.fn()}
        allValues={{ city_id: selected.id, country_id: 'us' }}
      />,
    );
    expect(await screen.findByText('Springfield')).toBeInTheDocument();
    expect(screen.getByText('US-MA')).toBeInTheDocument();
  });

  it('renders', async () => {
    await act(async () => {
      render(<CityAutocompleteField field={field} value="" onChange={vi.fn()} />);
    });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows the codes of the LINKED twin, not the first same-name match', async () => {
    const rows = [
      {
        id: 'me',
        name: 'Portland',
        country_id: 'us',
        region_code: 'US-ME',
        countries: { name: 'United States', code: 'US' },
      },
      {
        id: 'or',
        name: 'Portland',
        country_id: 'us',
        region_code: 'US-OR',
        countries: { name: 'United States', code: 'US' },
      },
    ];
    vi.mocked(listFromWhere).mockImplementation(async (_table, _select, filters) => {
      const id = filters.find((filter) => filter.col === 'id')?.val;
      return id ? rows.filter((row) => row.id === id) : rows;
    });
    const twinField = {
      ...(field as object),
      relatedFields: { city_id: 'city_id', country_id: 'country_id' },
    } as never;
    render(
      <CityAutocompleteField
        field={twinField}
        value="Portland"
        onChange={vi.fn()}
        allValues={{ city_id: 'or', country_id: 'us' }}
      />,
    );
    expect(await screen.findByText('US-OR')).toBeInTheDocument();
    expect(screen.queryByText('US-ME')).not.toBeInTheDocument();
  });
});
