import { describe, it, expect } from 'vitest';
import { SearchFetchException, isSearchUnavailable, SEARCH_UNAVAILABLE_MESSAGE } from '../searchFetch';

describe('searchFetch', () => {
  it('exports message', () => {
    expect(SEARCH_UNAVAILABLE_MESSAGE).toBeTruthy();
  });
  it('SearchFetchException carries detail', () => {
    const e = new SearchFetchException({ kind: 'timeout', message: 'too slow' });
    expect(e.detail.kind).toBe('timeout');
    expect(e.name).toBe('SearchFetchException');
  });
  it('isSearchUnavailable true for csp_or_dns_blocked', () => {
    const e = new SearchFetchException({ kind: 'csp_or_dns_blocked', message: 'blocked', cause: null });
    expect(isSearchUnavailable(e)).toBe(true);
  });
  it('isSearchUnavailable false for random error', () => {
    expect(isSearchUnavailable(new Error('nope'))).toBe(false);
  });
});
