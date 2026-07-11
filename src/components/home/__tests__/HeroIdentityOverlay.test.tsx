/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockStats = vi.hoisted(() => ({
  value: {
    venues: 3214,
    profiles: null,
    cities: 56,
    countries: null,
    events: 182,
    posts: null,
    personalities: null,
    groups: null,
    tags: null,
    marketplace: null,
    news: null,
    cms: null,
  } as Record<string, number | null>,
}));

// Interpolating t — the real i18next replaces {{n}}; the no-instance fallback
// t used in tests does not, so provide one.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultOrOpts?: string | Record<string, unknown>,
      maybeOpts?: Record<string, unknown>,
    ) => {
      const opts =
        typeof defaultOrOpts === 'object' ? defaultOrOpts : (maybeOpts ?? {});
      const template =
        typeof defaultOrOpts === 'string'
          ? defaultOrOpts
          : ((opts.defaultValue as string) ?? _key);
      return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts[k] ?? ''));
    },
    i18n: { language: 'en', dir: () => 'ltr' },
  }),
}));

vi.mock('@/hooks/useConsolidatedStats', () => ({
  useConsolidatedStats: () => ({
    stats: mockStats.value,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
// Count-up animates — irrelevant here, return the final value.
vi.mock('@/hooks/useCountUp', () => ({
  useCountUp: (target: number) => target,
}));

import { HeroIdentityOverlay } from '../HeroIdentityOverlay';

describe('HeroIdentityOverlay', () => {
  it('renders the headline and formatted stat chips, skipping null stats', () => {
    render(
      <MemoryRouter>
        <HeroIdentityOverlay variant="overlay" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Queer venues,');
    expect(screen.getByText('3,214 places')).toBeTruthy();
    expect(screen.getByText('182 events')).toBeTruthy();
    expect(screen.getByText('56 cities')).toBeTruthy();
    // null stats (profiles etc.) render no chip
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('band variant renders in normal flow with the h1', () => {
    render(
      <MemoryRouter>
        <HeroIdentityOverlay variant="band" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
