/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useAddressResolver', () => ({ useAddressResolver: () => ({ resolveAddress: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { CityAutocompleteField } from '../CityAutocompleteField';

const field = { name: 'city', label: 'City', type: 'city_autocomplete' } as never;

describe('CityAutocompleteField', () => {
  it('renders', () => {
    const { container } = render(<CityAutocompleteField field={field} value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
