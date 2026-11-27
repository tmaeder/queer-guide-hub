/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const state = vi.hoisted(() => ({
  intimate: null as Record<string, unknown> | null,
  liveStatus: null as Record<string, unknown> | null,
  error: null as string | null,
  goLive: vi.fn(),
  goInvisible: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, d?: string | Record<string, unknown>, o?: Record<string, unknown>) => {
      const template = typeof d === 'string' ? d : key;
      const vars = (typeof d === 'object' ? d : o) ?? {};
      return template.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(vars[n] ?? ''));
    },
  }),
}));
vi.mock('@/hooks/useNearMe', () => ({
  useNearMe: () => ({
    loading: false,
    error: state.error,
    goLive: state.goLive,
    goInvisible: state.goInvisible,
    liveStatus: state.liveStatus,
  }),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: state.intimate }),
}));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCities: () => ({ cities: [{ id: 'c1', name: 'Zürich' }], loading: false }),
}));

import { LivePresenceControl } from '../LivePresenceControl';

const renderControl = (audience?: 'everyone' | 'dating') =>
  render(
    <MemoryRouter>
      <LivePresenceControl defaultAudience={audience} />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.intimate = null;
  state.liveStatus = null;
  state.error = null;
  state.goLive = vi.fn().mockResolvedValue({ written: true });
  state.goInvisible = vi.fn();
});

describe('LivePresenceControl', () => {
  it('offers Dating only to opted-in members', () => {
    renderControl('dating');
    expect(screen.getByRole('radio', { name: 'Dating only' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Everyone' })).toBeChecked();
  });

  it('asks for the safety notice before the first dating presence', async () => {
    state.intimate = { opted_in_at: '2026-01-01', presence_safety_acknowledged_at: null };
    renderControl('dating');
    fireEvent.click(screen.getByRole('button', { name: 'Go live' }));
    expect(state.goLive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    const dialogGoLive = screen.getAllByRole('button', { name: 'Go live' }).at(-1)!;
    fireEvent.click(dialogGoLive);
    await waitFor(() =>
      expect(state.goLive).toHaveBeenCalledWith('dating', {
        durationMinutes: 60,
        cityId: null,
        safetyAcknowledged: true,
      }),
    );
  });

  it('goes live for dating at once when the notice was accepted before', async () => {
    state.intimate = { opted_in_at: '2026-01-01', presence_safety_acknowledged_at: '2026-01-02' };
    renderControl('dating');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '240' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go live' }));
    await waitFor(() =>
      expect(state.goLive).toHaveBeenCalledWith('dating', {
        durationMinutes: 240,
        cityId: null,
        safetyAcknowledged: false,
      }),
    );
  });

  it('falls back to a city when the device location fails', async () => {
    state.error = 'denied';
    renderControl();
    const goLive = screen.getByRole('button', { name: 'Go live' });
    expect(goLive).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Zürich/ }));
    fireEvent.click(goLive);
    await waitFor(() =>
      expect(state.goLive).toHaveBeenCalledWith('everyone', {
        durationMinutes: 60,
        cityId: 'c1',
        safetyAcknowledged: false,
      }),
    );
  });

  it('shows who sees a live presence and goes invisible', () => {
    state.liveStatus = {
      audience: 'dating',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      isHighRisk: false,
      written: true,
    };
    renderControl();
    expect(screen.getByText(/Live for Dating only until/)).toBeTruthy();
    expect(screen.getByText(/only a count for your city/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go invisible' }));
    expect(state.goInvisible).toHaveBeenCalled();
  });
});
