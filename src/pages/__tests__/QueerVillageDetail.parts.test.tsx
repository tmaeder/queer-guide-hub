/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import {
  buildVillageBreadcrumbs,
  VillageHero,
  VillageOverviewTab,
  VillagePhotosTab,
} from '../QueerVillageDetail.parts';

const village = { id: 'v1', name: 'Castro', slug: 'castro', city: { name: 'SF' }, country: { name: 'US' } } as never;

describe('QueerVillageDetail.parts', () => {
  it('buildVillageBreadcrumbs returns array', () => {
    const bc = buildVillageBreadcrumbs(village);
    expect(Array.isArray(bc)).toBe(true);
  });
  it('VillageHero renders', () => {
    const { container } = render(<MemoryRouter><VillageHero village={village} isFavorited={false} onFavoriteToggle={vi.fn()} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('VillageOverviewTab renders', () => {
    const { container } = render(<MemoryRouter><VillageOverviewTab village={village} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('VillagePhotosTab renders', () => {
    const { container } = render(<VillagePhotosTab village={village} />);
    expect(container).toBeTruthy();
  });
});
