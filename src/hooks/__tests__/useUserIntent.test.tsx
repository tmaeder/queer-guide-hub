/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const updateProfile = vi.fn().mockResolvedValue({ error: null });
const setStatus = vi.fn().mockResolvedValue({ error: null });
const profile: { looking_for: string[]; user_mode: string | null } = {
  looking_for: ['friends'],
  user_mode: 'friends',
};

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile, updateProfile }) }));
vi.mock('@/hooks/useUserMode', () => ({ useUserMode: () => ({ mode: 'friends', setMode: vi.fn() }) }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: { travel: null }, setStatus }) }));

import { useUserIntent } from '../useUserIntent';

beforeEach(() => {
  updateProfile.mockClear();
  setStatus.mockClear();
  profile.looking_for = ['friends'];
});

describe('useUserIntent', () => {
  it('reads only known looking_for values', () => {
    profile.looking_for = ['friends', 'garbage', 'dating'];
    const { result } = renderHook(() => useUserIntent());
    expect(result.current.lookingFor).toEqual(['friends', 'dating']);
  });

  it('toggle adds an unset value', async () => {
    const { result } = renderHook(() => useUserIntent());
    await act(async () => {
      await result.current.toggleLookingFor('dating');
    });
    expect(updateProfile).toHaveBeenCalledWith({ looking_for: ['friends', 'dating'] });
  });

  it('toggle removes an already-set value', async () => {
    const { result } = renderHook(() => useUserIntent());
    await act(async () => {
      await result.current.toggleLookingFor('friends');
    });
    expect(updateProfile).toHaveBeenCalledWith({ looking_for: [] });
  });

  it('setTravel(null) clears travel via status', async () => {
    const { result } = renderHook(() => useUserIntent());
    await act(async () => {
      await result.current.setTravel(null);
    });
    expect(setStatus).toHaveBeenCalledWith({ travel: null });
  });
});
