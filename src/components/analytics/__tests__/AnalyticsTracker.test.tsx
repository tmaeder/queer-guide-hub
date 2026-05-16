/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { trackFn } = vi.hoisted(() => ({ trackFn: vi.fn() }));

vi.mock('@/hooks/useUmamiAnalytics', () => ({
  useUmamiAnalytics: () => ({ trackPageView: trackFn }),
}));

import { AnalyticsTracker } from '../AnalyticsTracker';

beforeEach(() => trackFn.mockReset());

describe('AnalyticsTracker', () => {
  it('calls trackPageView with current pathname + search on mount', () => {
    render(
      <MemoryRouter initialEntries={['/foo?bar=1']}>
        <AnalyticsTracker />
      </MemoryRouter>,
    );
    expect(trackFn).toHaveBeenCalledWith('/foo?bar=1', expect.any(String));
  });

  it('renders nothing', () => {
    const { container } = render(
      <MemoryRouter>
        <AnalyticsTracker />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });
});
