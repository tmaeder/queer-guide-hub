/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockPeople = vi.hoisted(() => ({ value: [] as unknown[] }));

// Interpolating t (the no-instance fallback doesn't replace {{name}}).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultOrOpts?: string | Record<string, unknown>,
      maybeOpts?: Record<string, unknown>,
    ) => {
      const opts = typeof defaultOrOpts === 'object' ? defaultOrOpts : (maybeOpts ?? {});
      const template =
        typeof defaultOrOpts === 'string'
          ? defaultOrOpts
          : ((opts.defaultValue as string) ?? _key);
      return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts[k] ?? ''));
    },
    i18n: { language: 'en', dir: () => 'ltr' },
  }),
}));

vi.mock('@/hooks/useBornThisWeek', () => ({
  useBornThisWeek: () => ({ items: mockPeople.value, loading: false }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map(), loading: false }),
}));

import HomeBornThisWeek from '../HomeBornThisWeek';

describe('HomeBornThisWeek', () => {
  it('self-hides when nobody is in the window', () => {
    mockPeople.value = [];
    const { container } = render(
      <MemoryRouter>
        <HomeBornThisWeek />
      </MemoryRouter>,
    );
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders person chips with a celebrate control', () => {
    mockPeople.value = [
      {
        id: 'p1',
        slug: 'marsha-p-johnson',
        name: 'Marsha P. Johnson',
        image_url: null,
        profession: 'Activist',
        birth_date: '1945-08-24',
      },
    ];
    render(
      <MemoryRouter>
        <HomeBornThisWeek />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Marsha P. Johnson').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /Celebrate Marsha P. Johnson/ }).length,
    ).toBeGreaterThan(0);
  });
});
