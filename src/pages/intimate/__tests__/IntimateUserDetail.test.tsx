/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

// HubNavBar is page chrome here, and it now reads the inbox count and the
// viewer's profile through react-query. These specs render without a
// QueryClientProvider and are about the page's own content, so stub it —
// hubNavConsistency.test.ts is what asserts the bar is actually present.
vi.mock('@/components/hub/HubNavBar', () => ({ HubNavBar: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  me: null as Record<string, unknown> | null,
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useIntimateProfile: () => ({ data: state.profile, isLoading: false }),
  useMyIntimateProfile: () => ({ data: state.me }),
  useReportIntimateProfile: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntimateActions', () => ({
  useBlockUser: () => ({ mutate: vi.fn() }),
  useProfileDisplay: () => ({ display: 'pictogram' }),
  useSendFriendRequest: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useHankySignals', () => ({
  useMemberHankySignals: () => ({ data: {} }),
  useMyHankySignals: () => ({ data: {} }),
  useHankyVariants: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/kinks/KinkVisibleList', () => ({ KinkVisibleList: () => null }));
vi.mock('@/components/kinks/KinkPeerActions', () => ({ KinkPeerActions: () => null }));
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
        <Routes>
          <Route path="/intimate/:id" element={<IntimateUserDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('never renders limits, even when the row carries them', () => {
    state.me = { opted_in_at: '2026-01-01' };
    state.profile = {
      genitalia: null,
      genital_pictogram_key: null,
      body_pictogram_key: null,
      erection_angle_deg: null,
      role: ['vers'],
      into_tags: ['kissing'],
      limits: ['secret-hard-limit'],
      safer_sex_prefs: [],
    };
    render(
      <MemoryRouter initialEntries={['/meet/dating/u2']}>
        <Routes>
          <Route path="/meet/dating/:userId" element={<IntimateUserDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('kissing')).toBeTruthy();
    expect(screen.queryByText(/secret-hard-limit/)).toBeNull();
    expect(screen.queryByText('Limits')).toBeNull();
  });
});
