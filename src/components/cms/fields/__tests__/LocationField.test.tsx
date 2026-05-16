/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAddressResolver', () => ({ useAddressResolver: () => ({ resolveAddress: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/ui/location-autocomplete', () => ({
  LocationAutocomplete: () => null,
}));

import { LocationField } from '../LocationField';

const field = { name: 'addr', label: 'Address', type: 'location' } as never;

describe('LocationField', () => {
  it('renders', () => {
    const { container } = render(<LocationField field={field} value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
