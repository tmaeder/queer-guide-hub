/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: vi.fn().mockResolvedValue([]) }));

import { ProfessionAutocomplete } from '../profession-autocomplete';

describe('ProfessionAutocomplete', () => {
  it('renders', () => {
    const { container } = render(<ProfessionAutocomplete value="" onValueChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
