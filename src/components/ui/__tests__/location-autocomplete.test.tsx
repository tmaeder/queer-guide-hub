/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { suggestions: [] }, error: null }) } } }));

import { LocationAutocomplete } from '../location-autocomplete';

describe('LocationAutocomplete', () => {
  it('renders', () => {
    const { container } = render(<LocationAutocomplete value="" onValueChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
