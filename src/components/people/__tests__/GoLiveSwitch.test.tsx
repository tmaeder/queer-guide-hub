/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const goLive = vi.fn().mockResolvedValue(null);
const goInvisible = vi.fn().mockResolvedValue(undefined);
let live: object | null = null;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
vi.mock('@/hooks/useNearMe', () => ({
  useNearMe: () => ({
    supported: true,
    loading: false,
    error: null,
    goLive,
    goInvisible,
    liveStatus: live,
  }),
}));

import { GoLiveSwitch } from '../GoLiveSwitch';

describe('GoLiveSwitch', () => {
  beforeEach(() => {
    goLive.mockClear();
    goInvisible.mockClear();
  });

  it('goes live when switched on', () => {
    live = null;
    render(<GoLiveSwitch />);
    fireEvent.click(screen.getByRole('switch'));
    expect(goLive).toHaveBeenCalledWith('everyone');
  });

  it('reflects server live status and goes invisible when switched off', () => {
    live = { isHighRisk: false };
    render(<GoLiveSwitch />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(goInvisible).toHaveBeenCalled();
  });
});
