/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/admin/inline/Editable', () => ({
  Editable: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { CityHero } from '../CityHero';

describe('CityHero', () => {
  it('renders the city name as a heading', () => {
    render(
      <MemoryRouter>
        <CityHero
          city={{ id: 'c1', name: 'Berlin' } as never}
          imageUrl="https://example.com/x.jpg"
          isFavorited={false}
          onFavoriteToggle={vi.fn()}
          refetchCity={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Berlin/ })).toBeInTheDocument();
  });
});
