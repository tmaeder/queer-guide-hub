/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/layout/DetailHero', () => ({ DetailHero: () => <div>hero</div> }));
vi.mock('@/components/country/EqualityScoreBadge', () => ({ default: () => null }));
vi.mock('@/components/country/SafetyAlertBanner', () => ({ default: () => null }));

import { CityHero } from '../CityHero';

describe('CityHero', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <CityHero
          city={{ id: 'c1', name: 'Berlin' } as never}
          imageUrl="https://example.com/x.jpg" isFavorited={false}
          hasAirport={false} effectiveIata={null}
          onFavoriteToggle={vi.fn()} refetchCity={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
