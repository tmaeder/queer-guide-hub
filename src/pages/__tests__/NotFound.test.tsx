/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Mirrors i18next's `t(key, defaultValue, options)` closely enough to
    // catch an interpolation that never lands: the page renders the failed
    // path INTO the lede, so a mock that ignored `options` would let a
    // literal `{{path}}` ship.
    t: (k: string, d?: string, opts?: Record<string, unknown>) =>
      (d ?? k).replace(/\{\{(\w+)\}\}/g, (m, name) => String(opts?.[name] ?? m)),
  }),
}));
vi.mock('@/components/seo/NotFoundMeta', () => ({ NotFoundMeta: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({
    to,
    children,
    ...rest
  }: { to: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
// RecommendedForYou pulls useAuth + a network fetch; not under test here.
vi.mock('@/components/discovery/RecommendedForYou', () => ({ RecommendedForYou: () => null }));
// Search proxy + slug-redirect lookups are best-effort side effects.
vi.mock('@/lib/searchClient', () => ({ fetchAutocomplete: () => Promise.resolve([]) }));
vi.mock('@/hooks/useVenueSlugRedirect', () => ({ useVenueSlugRedirect: () => null }));
vi.mock('@/utils/autoFileError', () => ({ fileError: () => {} }));

import NotFound from '../NotFound';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>,
  );

describe('NotFound page', () => {
  it('renders the heading, the 404 service code and a return-home link', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1, name: /No stop here/i })).toBeInTheDocument();
    // 404 survives as the service code in the kicker, not as the heading.
    expect(screen.getByText(/404/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return Home/i })).toHaveAttribute('href', '/');
  });

  it('shows Go Back button', () => {
    renderAt('/nope');
    expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
  });

  it('names the failed path in the lede and the failed slug as the ghost station', () => {
    renderAt('/venues/blue-oyster');
    expect(screen.getByText(/\/venues\/blue-oyster/)).toBeInTheDocument();
    expect(screen.getByText('blue-oyster')).toBeInTheDocument();
  });

  it('uses type-aware copy for a known section', () => {
    renderAt('/venues/blue-oyster');
    expect(screen.getByRole('heading', { level: 1, name: /No venue at this stop/i })).toBeInTheDocument();
  });
});
