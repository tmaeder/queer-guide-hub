/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  me: null as Record<string, unknown> | null,
  matches: [] as { other_id: string }[],
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useIntimateProfile: (id?: string) => ({ data: id ? state.profile : null, isLoading: false }),
  useMyIntimateProfile: () => ({ data: state.me }),
  useReportIntimateProfile: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useIntimateMatches', () => ({
  useIntimateMatches: () => ({ data: state.matches }),
  useMyIntimateLikes: () => ({ data: [] }),
  useMyIntimatePasses: () => ({ data: [] }),
  useLikeTarget: () => ({ mutate: vi.fn(), isPending: false }),
  usePassTarget: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useIntimateActions', () => ({ useBlockUser: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useHankySignals', () => ({
  useMemberHankySignals: () => ({ data: {} }),
  useMyHankySignals: () => ({ data: {} }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/kinks/KinkVisibleList', () => ({ KinkVisibleList: () => null }));
vi.mock('@/hooks/useKinkVisibleList', () => ({ useKinkVisibleList: () => ({ data: [] }) }));
vi.mock('@/components/kinks/KinkPeerActions', () => ({ KinkPeerActions: () => null }));
vi.mock('@/assets/intimate/pictograms', () => ({
  getGenitalPictogramSet: () => ({}),
  bodyPictograms: {},
  angleOptions: [],
}));

import { DatingTab } from '../DatingTab';

const PROFILE = {
  opted_in_at: '2026-01-01',
  genitalia: null,
  genital_pictogram_key: null,
  body_pictogram_key: null,
  erection_angle_deg: null,
  role: ['vers'],
  into_tags: ['kissing'],
  limits: ['secret-hard-limit'],
  safer_sex_prefs: [],
};

function renderTab(isOwnProfile = false) {
  return render(
    <MemoryRouter>
      <DatingTab userId="other" isOwnProfile={isOwnProfile} />
    </MemoryRouter>,
  );
}

describe('DatingTab', () => {
  beforeEach(() => {
    state.me = { opted_in_at: '2026-01-01' };
    state.profile = { ...PROFILE };
    state.matches = [];
  });

  it('never renders limits, even when the row carries them', () => {
    renderTab();
    expect(screen.getByText('kissing')).toBeTruthy();
    expect(screen.queryByText(/secret-hard-limit/)).toBeNull();
    expect(screen.queryByText('Limits')).toBeNull();
  });

  it('offers like and pass, and Message only once matched', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Message' })).toBeNull();

    state.matches = [{ other_id: 'other' }];
    renderTab();
    expect(screen.getByRole('link', { name: 'Message' })).toBeTruthy();
  });

  it('shows the owner an edit link instead of actions', () => {
    renderTab(true);
    expect(screen.getByRole('link', { name: 'Edit dating profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
  });
});

describe('DatingTab empty sections', () => {
  it('leaves out sections that have nothing in them', () => {
    state.me = { opted_in_at: '2026-01-01' };
    state.profile = { ...PROFILE, role: [], into_tags: [] };
    state.matches = [];
    renderTab();
    expect(screen.queryByText('Body & anatomy')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(screen.getByText('this member hasn’t filled in a dating profile yet.')).toBeTruthy();
  });

  it('explains what Like does and that the kink list is not shared', () => {
    state.me = { opted_in_at: '2026-01-01' };
    state.profile = { ...PROFILE };
    state.matches = [];
    render(
      <MemoryRouter>
        <DatingTab userId="other" isOwnProfile={false} displayName="@sam" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Interested in @sam?' })).toBeTruthy();
    expect(screen.getByText(/If they like you back, it’s a match/)).toBeTruthy();
    expect(screen.getByText(/@sam hasn’t shared their kink list with you/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Block @sam' })).toBeTruthy();
  });
});
