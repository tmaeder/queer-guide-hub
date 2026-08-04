import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

type Consent = {
  matched_at: string;
  ended_at: string | null;
  photo_unlocked_a: boolean;
  photo_unlocked_b: boolean;
  location_expires_at: string | null;
};

const consent: { value: Consent | null } = { value: null };

vi.mock('@/hooks/useIntimateThread', () => ({
  useIntimateThreadConsent: () => ({ data: consent.value }),
  useMyConsentSide: () => ({ data: 'a' }),
  useOpeningMoves: () => ({ data: [] }),
  useEndIntimateThread: () => ({ mutate: vi.fn(), isPending: false }),
  useSetPhotoUnlock: () => ({ mutate: vi.fn(), isPending: false }),
  useShareLocation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useConversationOther', () => ({
  useConversationOther: () => ({ data: 'them' }),
}));

vi.mock('@/components/kinks/KinkPeerActions', () => ({
  KinkPeerActions: () => null,
}));

import { IntimateMatchThread } from '../IntimateMatchThread';

const BASE: Consent = {
  matched_at: '2026-08-04T10:00:00.000Z',
  ended_at: null,
  photo_unlocked_a: false,
  photo_unlocked_b: false,
  location_expires_at: null,
};

/** The share is live iff "Stop sharing" is offered instead of the presets. */
function shareIsShownAsLive() {
  return screen.queryByRole('button', { name: 'Stop sharing' }) !== null;
}

describe('IntimateMatchThread location share expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the presets when nothing is shared', () => {
    consent.value = { ...BASE, location_expires_at: null };
    render(<IntimateMatchThread conversationId="c1" hasMessages />);

    expect(shareIsShownAsLive()).toBe(false);
    expect(screen.getByRole('button', { name: '15 min' })).toBeInTheDocument();
  });

  it('stops claiming an active share the moment the deadline passes', () => {
    // 15 minutes out — the shortest preset.
    consent.value = { ...BASE, location_expires_at: '2026-08-04T12:15:00.000Z' };
    render(<IntimateMatchThread conversationId="c1" hasMessages />);

    expect(shareIsShownAsLive()).toBe(true);

    // One second short of the deadline: still live, and no timer has fired.
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000 - 1000);
    });
    expect(shareIsShownAsLive()).toBe(true);

    // Crossing the deadline must flip the UI on its own, with no refetch, no
    // route change and no other interaction. This is the regression: the old
    // render-time `Date.now()` read left "Stop sharing" on screen indefinitely
    // because nothing scheduled a re-render here.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shareIsShownAsLive()).toBe(false);
    expect(screen.getByRole('button', { name: '15 min' })).toBeInTheDocument();
  });

  it('treats an already-lapsed timestamp as expired on first paint', () => {
    consent.value = { ...BASE, location_expires_at: '2026-08-04T11:59:00.000Z' };
    render(<IntimateMatchThread conversationId="c1" hasMessages />);

    expect(shareIsShownAsLive()).toBe(false);
  });

  it('does not expire a share whose deadline overflows the 32-bit timer', () => {
    // setTimeout fires immediately past ~24.8 days, which would read as an
    // instant expiry — the opposite of what the timestamp says.
    consent.value = { ...BASE, location_expires_at: '2027-08-04T12:00:00.000Z' };
    render(<IntimateMatchThread conversationId="c1" hasMessages />);

    expect(shareIsShownAsLive()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(shareIsShownAsLive()).toBe(true);
  });
});
