import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorldBankData } from '../useWorldBankData';

describe('useWorldBankData', () => {
  it('should return empty data for null country', () => {
    const { result } = renderHook(() => useWorldBankData(null));
    expect(result.current.hasData).toBe(false);
    expect(result.current.indicators).toEqual({});
  });

  it('should return hasData true when wb_last_synced_at exists', () => {
    const { result } = renderHook(() => useWorldBankData({ wb_last_synced_at: '2024-01-01' }));
    expect(result.current.hasData).toBe(true);
  });

  it('should return hasData true when gdp_usd exists', () => {
    const { result } = renderHook(() => useWorldBankData({ gdp_usd: 1000000 }));
    expect(result.current.hasData).toBe(true);
  });

  it('should return hasData true when wb_income_level exists', () => {
    const { result } = renderHook(() => useWorldBankData({ wb_income_level: 'High income' }));
    expect(result.current.hasData).toBe(true);
  });

  it('should return hasData true when indicators have keys', () => {
    const { result } = renderHook(() => useWorldBankData({ wb_indicators: { gini_index: 33 } }));
    expect(result.current.hasData).toBe(true);
    expect(result.current.indicators.gini_index).toBe(33);
  });

  it('should return hasData false for empty country object', () => {
    const { result } = renderHook(() => useWorldBankData({}));
    expect(result.current.hasData).toBe(false);
  });

  it('should map all direct DB columns', () => {
    const country = {
      gdp_usd: 500,
      population: 8_000_000,
      life_expectancy: 83,
      literacy_rate: 99,
      human_development_index: 0.96,
      wb_income_level: 'High income',
      wb_region: 'Europe & Central Asia',
    };
    const { result } = renderHook(() => useWorldBankData(country));
    expect(result.current.gdp_usd).toBe(500);
    expect(result.current.population).toBe(8_000_000);
    expect(result.current.wb_income_level).toBe('High income');
  });
});
