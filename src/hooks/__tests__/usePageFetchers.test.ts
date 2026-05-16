import { describe, it, expect } from 'vitest';
import * as fetchers from '../usePageFetchers';

describe('usePageFetchers barrel', () => {
  it('exports many fetcher functions', () => {
    expect(typeof fetchers.fetchCountryNameById).toBe('function');
    expect(typeof fetchers.deleteCommunityGroup).toBe('function');
    expect(typeof fetchers.fetchEmailTemplates).toBe('function');
    expect(Object.keys(fetchers).length).toBeGreaterThan(20);
  });
});
