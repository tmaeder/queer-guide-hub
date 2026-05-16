/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { NewsFilters } from '../NewsFilters';

describe('NewsFilters', () => {
  it('renders without crashing', () => {
    const { container } = render(<NewsFilters onFiltersChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
