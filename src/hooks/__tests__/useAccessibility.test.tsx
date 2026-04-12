import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AccessibilityProvider, useAccessibility } from '../useAccessibility';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AccessibilityProvider>{children}</AccessibilityProvider>
);

describe('useAccessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('should throw when used outside provider', () => {
    expect(() => {
      renderHook(() => useAccessibility());
    }).toThrow('useAccessibility must be used within an AccessibilityProvider');
  });

  it('should return default settings', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    expect(result.current.settings.fontSize).toBe('medium');
    expect(result.current.settings.highContrast).toBe(false);
    expect(result.current.settings.reduceMotion).toBe(false);
  });

  it('should update a setting', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => { result.current.updateSetting('fontSize', 'large'); });
    expect(result.current.settings.fontSize).toBe('large');
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => { result.current.updateSetting('highContrast', true); });
    const stored = JSON.parse(localStorage.getItem('accessibility-settings')!);
    expect(stored.highContrast).toBe(true);
  });

  it('should apply high-contrast class to document', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => { result.current.updateSetting('highContrast', true); });
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
  });

  it('should apply font-size class to document', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => { result.current.updateSetting('fontSize', 'extra-large'); });
    expect(document.documentElement.classList.contains('font-size-extra-large')).toBe(true);
  });

  it('should reset to defaults', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => { result.current.updateSetting('highContrast', true); });
    act(() => { result.current.resetToDefaults(); });
    expect(result.current.settings.highContrast).toBe(false);
  });

  it('should load saved settings from localStorage', () => {
    localStorage.setItem('accessibility-settings', JSON.stringify({
      fontSize: 'large',
      highContrast: true,
      reduceMotion: false,
      screenReaderOptimized: false,
      focusIndicators: true,
    }));
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    expect(result.current.settings.fontSize).toBe('large');
    expect(result.current.settings.highContrast).toBe(true);
    expect(result.current.settings.focusIndicators).toBe(true);
  });
});
