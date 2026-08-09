import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('ThemeProvider (light-only — dark mode removed 2026-08)', () => {
  it('always reports light and ignores setTheme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    act(() => { result.current.setTheme('dark'); });
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('strips a persisted dark preference and dark class', () => {
    localStorage.setItem('ui-theme', 'dark');
    document.documentElement.classList.add('dark');
    renderHook(() => useTheme(), { wrapper });
    expect(localStorage.getItem('ui-theme')).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
