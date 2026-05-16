/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));

import { CountryAutocomplete } from '../country-autocomplete';

describe('CountryAutocomplete', () => {
  it('renders', () => {
    const { container } = render(<CountryAutocomplete value="" onValueChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
