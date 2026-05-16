/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUpcomingPrideEvents', () => ({ useUpcomingPrideEvents: () => ({ data: [], isLoading: false }) }));

import { PrideScroller } from '../PrideScroller';

describe('PrideScroller', () => {
  it('renders', () => {
    const { container } = render(<PrideScroller />);
    expect(container).toBeTruthy();
  });
});
