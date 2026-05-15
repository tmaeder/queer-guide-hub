/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

import { useUserCountry, countryLabel, SUPPORTED_COUNTRIES } from '../useUserCountry';

function wrap(initialEntries: string[] = ['/']) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('SUPPORTED_COUNTRIES', () => {
  it('includes major regions + INT fallback', () => {
    expect(SUPPORTED_COUNTRIES.DE).toBe('Deutschland');
    expect(SUPPORTED_COUNTRIES.INT).toBe('International');
    expect(SUPPORTED_COUNTRIES.US).toBeDefined();
  });
});

describe('countryLabel', () => {
  it('returns the label for known codes', () => {
    expect(countryLabel('CH')).toBe('Schweiz');
  });

  it('returns the code itself for unknown codes', () => {
    expect(countryLabel('XX')).toBe('XX');
  });
});

describe('useUserCountry — initial resolution', () => {
  describe('Navigator-based', () => {
    let originalDescriptor: PropertyDescriptor | undefined;
    beforeEach(() => {
      originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
      Object.defineProperty(navigator, 'language', {
        configurable: true,
        get: () => 'de-DE',
      });
    });
    afterEach(() => {
      if (originalDescriptor) Object.defineProperty(navigator, 'language', originalDescriptor);
    });

    it("picks navigator region when no URL param + no stored value", () => {
      const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
      expect(result.current.country).toBe('DE');
    });

    it("falls back to INT for an unsupported region", () => {
      Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'ja-JP' });
      const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
      expect(result.current.country).toBe('INT');
    });
  });

  it('URL ?country=CH overrides everything else', () => {
    localStorage.setItem('qg_user_country', 'GB');
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap(['/?country=CH']) });
    expect(result.current.country).toBe('CH');
  });

  it('localStorage wins over navigator when no URL param', () => {
    localStorage.setItem('qg_user_country', 'GB');
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
    expect(result.current.country).toBe('GB');
  });

  it('ignores invalid URL country', () => {
    localStorage.setItem('qg_user_country', 'GB');
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap(['/?country=ZZ']) });
    // ZZ isn't in SUPPORTED → falls through to stored GB.
    expect(result.current.country).toBe('GB');
  });
});

describe('useUserCountry — setCountry', () => {
  it('persists valid choices to localStorage', () => {
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
    act(() => result.current.setCountry('US'));

    expect(result.current.country).toBe('US');
    expect(localStorage.getItem('qg_user_country')).toBe('US');
  });

  it('coerces unsupported codes to INT', () => {
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
    act(() => result.current.setCountry('ZZ'));
    expect(result.current.country).toBe('INT');
  });
});

describe('useUserCountry — countries export', () => {
  it('returns the SUPPORTED_COUNTRIES map', () => {
    const { result } = renderHook(() => useUserCountry(), { wrapper: wrap() });
    expect(result.current.countries).toBe(SUPPORTED_COUNTRIES);
  });
});
