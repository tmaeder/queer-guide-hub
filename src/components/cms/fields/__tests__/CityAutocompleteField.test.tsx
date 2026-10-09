/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
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
