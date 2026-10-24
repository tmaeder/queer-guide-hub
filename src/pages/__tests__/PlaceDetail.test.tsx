/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useGeoPlaces', () => ({
  usePlaceDetail: () => ({
    data: {
      id: 'l1',
      name: 'Tiergarten',
      slug: 'tiergarten',
      description: null,
      image_url: null,
      latitude: null,
      longitude: null,
      safety_gated: false,
      geo_landmark_profiles: {
        landmark_kind: 'park',
        address: null,
        website: null,
        accessibility_notes: null,
        tags: [],
      },
    },
    isLoading: false,
    error: null,
  }),
  useGeoBreadcrumbs: () => ({ data: [] }),
}));
vi.mock('@/components/entity/EntityDetailLayout', () => ({
  EntityDetailLayout: ({ hero }: { hero: ReactNode }) => <div>{hero}</div>,
}));
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: {
    contentType: string;
    contentId: string;
    exportable?: boolean;
    currentData?: unknown;
  }) => (
    <span
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-exportable={String(Boolean(p.exportable))}
      data-seeded={String(p.currentData !== undefined)}
    />
  ),
}));

import PlaceDetail from '../PlaceDetail';

describe('PlaceDetail admin menu', () => {
  it('gives staff the landmark admin menu with the record export', () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/place/tiergarten']}>
        <Routes>
          <Route path="/place/:slug" element={<PlaceDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const btn = getByTestId('admin-edit');
    expect(btn).toHaveAttribute('data-type', 'landmarks');
    expect(btn).toHaveAttribute('data-id', 'l1');
    expect(btn).toHaveAttribute('data-exportable', 'true');
    // The page loads only the fields it renders; seeding the edit sheet with
    // them would hide every other landmark column from the editor.
    expect(btn).toHaveAttribute('data-seeded', 'false');
  });
});
