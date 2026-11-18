import { describe, expect, it } from 'vitest';
import { localizedRedirectTarget } from '../localizedRedirectTarget';

describe('localized redirect destinations', () => {
  it('keeps incoming queries before a fixed methodology anchor', () => {
    expect(
      localizedRedirectTarget('/tags/rights-by-country/sources#points', '/de', {
        search: '?utm_source=library',
        hash: '#old',
      }),
    ).toEqual({
      pathname: '/de/tags/rights-by-country/sources',
      search: '?utm_source=library',
      hash: '#points',
    });
  });
  it('retains destination queries and incoming fragments', () => {
    expect(
      localizedRedirectTarget('/hub?view=trips', '/ar', {
        search: '?discard=1',
        hash: '#saved',
      }),
    ).toEqual({ pathname: '/ar/hub', search: '?view=trips', hash: '#saved' });
  });
  it('preserves explicitly empty target queries and fragments', () => {
    expect(
      localizedRedirectTarget('/hub?#', '', {
        search: '?discard=1',
        hash: '#discard',
      }),
    ).toEqual({ pathname: '/hub', search: '', hash: '' });
  });
});
