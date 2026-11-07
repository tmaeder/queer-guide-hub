/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminPageHeader } from '../AdminPageHeader';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/venues${search}`]}>
      <AdminPageHeader title="Venues" />
    </MemoryRouter>,
  );
}

describe('AdminPageHeader ?from= back link', () => {
  it('links back to a same-origin admin path', () => {
    renderAt('?from=%2Fadmin%2Fquality');
    expect(screen.getByRole('link', { name: /back|quality/i })).toHaveAttribute(
      'href',
      '/admin/quality',
    );
  });

  // Admin routes skip the leave-site notice, so an off-site Back link would
  // leave queer.guide on one click with no warning.
  it.each([
    'https://evil.example/phish',
    '//evil.example/x',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('renders no back link for %s', (from) => {
    renderAt(`?from=${encodeURIComponent(from)}`);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
