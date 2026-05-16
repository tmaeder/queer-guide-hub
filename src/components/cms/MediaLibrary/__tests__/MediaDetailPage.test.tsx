/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useMediaDetail', () => ({ useMediaDetail: () => ({ data: null, isLoading: false, error: null }) }));
vi.mock('@/hooks/useMediaMutations', () => ({
  useMediaMutations: () => ({
    updateMeta: { mutate: vi.fn(), isPending: false },
    deleteMedia: { mutate: vi.fn(), isPending: false },
    isPending: false,
  }),
}));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));

import { MediaDetailPage } from '../MediaDetailPage';

describe('MediaDetailPage', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/media/m1']}>
        <Routes><Route path="/media/:id" element={<MediaDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
