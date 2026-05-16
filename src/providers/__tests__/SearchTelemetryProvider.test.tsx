/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Mock dependencies — the debounced view-fire path is intentionally not
// exercised (1s timer + module-level caches + cross-test state make it a
// fragile target; the page-level routing E2E catches regressions there).
const trackSearchEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/searchClient', () => ({
  trackSearchEvent: trackSearchEventMock,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { SearchTelemetryProvider } from '../SearchTelemetryProvider';

describe('SearchTelemetryProvider', () => {
  it('renders children unchanged inside a router', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <SearchTelemetryProvider>
          <div>child content</div>
        </SearchTelemetryProvider>
      </MemoryRouter>,
    );
    expect(getByText('child content')).toBeInTheDocument();
  });

  it('mounts on a deep route without throwing', () => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={['/venues/berghain']}>
          <SearchTelemetryProvider>
            <span>ok</span>
          </SearchTelemetryProvider>
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
