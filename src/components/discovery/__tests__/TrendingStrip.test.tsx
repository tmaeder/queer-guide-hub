/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders as render } from '@/test/test-utils';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));

import { TrendingStrip } from '../TrendingStrip';

describe('TrendingStrip', () => {
  it('renders', () => {
    const { container } = render(<TrendingStrip />);
    expect(container).toBeTruthy();
  });
});
