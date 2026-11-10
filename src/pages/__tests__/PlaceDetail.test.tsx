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
      description: 'A large public park in central Berlin.',
      image_url: '/tiergarten.jpg',
      latitude: null,
      longitude: null,
      safety_gated: false,
      geo_landmark_profiles: {
        landmark_kind: 'park',
        address: 'Straße des 17. Juni, Berlin',
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
  it('shows the landmark facts before its photo and keeps the staff edit menu', () => {
    const { getByTestId, getByText, getByRole } = render(
      <MemoryRouter initialEntries={['/place/tiergarten']}>
        <Routes>
          <Route path="/place/:slug" element={<PlaceDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const image = getByRole('img', { name: 'Tiergarten' });
    for (const copy of ['A large public park in central Berlin.', 'Straße des 17. Juni, Berlin']) {
      expect(getByText(copy).compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const btn = getByTestId('admin-edit');
    expect(btn).toHaveAttribute('data-type', 'landmarks');
    expect(btn).toHaveAttribute('data-id', 'l1');
    expect(btn).toHaveAttribute('data-exportable', 'true');
    // The page loads only the fields it renders; seeding the edit sheet with
    // them would hide every other landmark column from the editor.
    expect(btn).toHaveAttribute('data-seeded', 'false');
  });
});
