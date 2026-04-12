import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hapticTrigger } from '../useHaptics';

describe('hapticTrigger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should not throw when navigator.vibrate is unavailable', () => {
    expect(() => hapticTrigger('nudge')).not.toThrow();
  });

  it('should call navigator.vibrate when available', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true });
    hapticTrigger('success');
    expect(vibrateMock).toHaveBeenCalledWith([30, 60, 40]);
    delete (navigator as unknown as Record<string, unknown>).vibrate;
  });

  it('should not vibrate when prefers-reduced-motion', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true });
    // matchMedia already mocked in setup to return matches: false
    // Override for this test
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    hapticTrigger('nudge');
    expect(vibrateMock).not.toHaveBeenCalled();
    delete (navigator as unknown as Record<string, unknown>).vibrate;
  });
});
