/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/components/seo/NotFoundMeta', () => ({ NotFoundMeta: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
// RecommendedForYou pulls useAuth + a network fetch; not under test here.
vi.mock('@/components/discovery/RecommendedForYou', () => ({ RecommendedForYou: () => null }));
// Search proxy + slug-redirect lookups are best-effort side effects.
vi.mock('@/lib/searchClient', () => ({ fetchAutocomplete: () => Promise.resolve([]) }));
vi.mock('@/hooks/useVenueSlugRedirect', () => ({ useVenueSlugRedirect: () => null }));
vi.mock('@/utils/autoFileError', () => ({ fileError: () => {} }));

import NotFound from '../NotFound';

describe('NotFound page', () => {
  it('renders 404 heading + return home link', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return Home/i })).toHaveAttribute('href', '/');
  });

  it('shows Go Back button', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
  });
});
