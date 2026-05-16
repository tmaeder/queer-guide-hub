/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { useLocalizedNavigate } from '../useLocalizedNavigate';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/en/path']}>
      <Routes><Route path="/:locale/*" element={children} /></Routes>
    </MemoryRouter>
  );
}

describe('useLocalizedNavigate', () => {
  it('returns callable function', () => {
    const { result } = renderHook(() => useLocalizedNavigate(), { wrapper });
    expect(typeof result.current).toBe('function');
  });
});
