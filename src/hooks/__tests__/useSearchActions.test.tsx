/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { trackSearchEventMock, submitFeedbackMock, useAuthMock } = vi.hoisted(() => ({
  trackSearchEventMock: vi.fn(),
  submitFeedbackMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/lib/searchClient', () => ({
  trackSearchEvent: trackSearchEventMock,
  submitFeedback: submitFeedbackMock,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useTrackClick,
  useTrack,
  useSaveAction,
  useFeedbackVote,
  useBookingTracker,
  useAttendTracker,
} from '../useSearchActions';

beforeEach(() => {
  trackSearchEventMock.mockReset();
  submitFeedbackMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useTrackClick', () => {
  it('fires click event with source + extra metadata', () => {
    const { result } = renderHook(() => useTrackClick());
    result.current({ type: 'venue', id: 'v1' }, 'rail', { rank: 2 });
    expect(trackSearchEventMock).toHaveBeenCalledWith(
      'click', { type: 'venue', id: 'v1' }, { source: 'rail', rank: 2 }, 'u1',
    );
  });

  it('passes null userId when signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useTrackClick());
    result.current({ type: 'venue', id: 'v1' });
    expect(trackSearchEventMock.mock.calls[0][3]).toBeNull();
  });
});

describe('useTrack', () => {
  it('fires a custom event name', () => {
    const { result } = renderHook(() => useTrack());
    result.current('dismiss', { type: 'venue', id: 'v1' }, { source: 'card' });
    expect(trackSearchEventMock).toHaveBeenCalledWith(
      'dismiss', { type: 'venue', id: 'v1' }, { source: 'card' }, 'u1',
    );
  });
});

describe('useSaveAction', () => {
  it('emits save when isNowSaved=true', () => {
    const { result } = renderHook(() => useSaveAction());
    result.current({ type: 'venue', id: 'v1' }, true);
    expect(trackSearchEventMock.mock.calls[0][0]).toBe('save');
  });

  it('emits dismiss when isNowSaved=false', () => {
    const { result } = renderHook(() => useSaveAction());
    result.current({ type: 'venue', id: 'v1' }, false);
    expect(trackSearchEventMock.mock.calls[0][0]).toBe('dismiss');
  });
});

describe('useFeedbackVote', () => {
  it('fires submitFeedback with vote + query', () => {
    const { result } = renderHook(() => useFeedbackVote());
    result.current({ type: 'venue', id: 'v1' }, 'up', 'pride');
    expect(submitFeedbackMock).toHaveBeenCalledWith(
      { type: 'venue', id: 'v1' }, 'up', 'pride', 'u1',
    );
  });
});

describe('useBookingTracker / useAttendTracker', () => {
  it('useBookingTracker emits book event', () => {
    const { result } = renderHook(() => useBookingTracker());
    result.current({ type: 'venue', id: 'v1' });
    expect(trackSearchEventMock.mock.calls[0][0]).toBe('book');
  });

  it('useAttendTracker emits attend event', () => {
    const { result } = renderHook(() => useAttendTracker());
    result.current({ type: 'event', id: 'e1' });
    expect(trackSearchEventMock.mock.calls[0][0]).toBe('attend');
  });
});
