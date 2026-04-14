import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
);

describe('ThemeProvider', () => {
  it('should provide default theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
  });

  it('should update theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme('dark'); });
    expect(result.current.theme).toBe('dark');
  });

  it('should persist theme to localStorage', () => {
    localStorage.clear();
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme('dark'); });
    expect(localStorage.getItem('ui-theme')).toBe('dark');
  });

  it('should add dark class to document', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme('dark'); });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
