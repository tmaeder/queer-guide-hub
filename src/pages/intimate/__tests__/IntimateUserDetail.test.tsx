/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useIntimateProfile: () => ({ data: null, isLoading: false }),
  useMyIntimateProfile: () => ({ data: null }),
  useReportIntimateProfile: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntimateActions', () => ({
  useBlockUser: () => ({ mutate: vi.fn() }),
  useProfileDisplay: () => ({ display: 'pictogram' }),
  useSendFriendRequest: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/assets/intimate/pictograms', () => ({
  getGenitalPictogramSet: () => [],
  bodyPictograms: [],
  angleOptions: [],
}));

import IntimateUserDetail from '../IntimateUserDetail';

describe('IntimateUserDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/intimate/u1']}>
        <Routes><Route path="/intimate/:id" element={<IntimateUserDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
