/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { LocalizedLink } from '../LocalizedLink';

vi.mock('@/i18n/languages', () => ({
  DEFAULT_LOCALE: 'en',
  isSupportedLocale: (l: string) => ['en', 'de', 'fr'].includes(l),
}));

function render_at(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path=":locale/*" element={ui} />
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LocalizedLink', () => {
  it('does not prefix when on default locale', () => {
    render_at('/venues', <LocalizedLink to="/cities">x</LocalizedLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/cities');
  });

  it('prefixes with current locale when on non-default route', () => {
    render_at('/de/venues', <LocalizedLink to="/cities">x</LocalizedLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/de/cities');
  });

  it('does not prefix /admin links', () => {
    render_at('/de/foo', <LocalizedLink to="/admin/users">x</LocalizedLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/users');
  });

  it('does not prefix /auth links', () => {
    render_at('/de/foo', <LocalizedLink to="/auth">x</LocalizedLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/auth');
  });

  it('does not prefix http(s) URLs', () => {
    render_at('/de/foo', <LocalizedLink to="https://example.com">x</LocalizedLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com');
  });
});
