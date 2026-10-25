/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useAddressResolver', () => ({
  useAddressResolver: () => ({ resolveAddress: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { CityAutocompleteField } from '../CityAutocompleteField';
import { listFromWhere } from '@/hooks/usePageFetchers';

const field = { name: 'city', label: 'City', type: 'city_autocomplete' } as never;

describe('CityAutocompleteField', () => {
  beforeEach(() => {
    vi.mocked(listFromWhere).mockReset().mockResolvedValue([]);
  });
  it('resolves an existing city outside the capped option list without changing the record', async () => {
    vi.mocked(listFromWhere).mockImplementation(async (_table, _select, filters) =>
      filters.some((filter) => filter.col === 'id' && filter.val === 'linked-city')
        ? [
            {
              id: 'linked-city',
              name: 'West Hollywood',
              country_id: 'us',
              region_code: 'US-CA',
              countries: { name: 'United States', code: 'US' },
            },
          ]
        : [
            {
              id: 'first-page-city',
              name: 'Aardvark',
              country_id: 'us',
              countries: { name: 'United States', code: 'US' },
            },
          ],
    );
    const onChange = vi.fn(),
      setFields = vi.fn();
    render(
      <CityAutocompleteField
        field={
          {
            ...(field as object),
            relatedFields: { city_id: 'city_id', country_id: 'country_id' },
          } as never
        }
        value={undefined}
        allValues={{ city_id: 'linked-city', country_id: 'us' }}
        onChange={onChange}
        setFields={setFields}
      />,
    );
    expect(await screen.findByText('West Hollywood')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    expect(setFields).not.toHaveBeenCalled();
  });

  it('renders', () => {
    const { container } = render(
      <CityAutocompleteField field={field} value="" onChange={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });

  it('shows the codes of the LINKED twin, not the first same-name match', async () => {
    vi.mocked(listFromWhere).mockResolvedValueOnce([
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
    ]);
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
