import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: vi.fn() }));

import { episodeSearchPattern } from '../usePodcasts';

describe('episodeSearchPattern', () => {
  it('ignores queries shorter than two characters', () => {
    expect(episodeSearchPattern('')).toBeNull();
    expect(episodeSearchPattern(' a ')).toBeNull();
  });
  it('wraps the query for a contains match', () => {
    expect(episodeSearchPattern(' christmas ')).toBe('%christmas%');
  });
  it('escapes LIKE wildcards and drops PostgREST separators', () => {
    expect(episodeSearchPattern('50%_off')).toBe('%50\\%\\_off%');
    expect(episodeSearchPattern('a,b(c)')).toBe('%a b c %');
  });
});
