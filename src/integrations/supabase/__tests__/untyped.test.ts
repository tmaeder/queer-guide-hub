import { describe, it, expect, vi } from 'vitest';

vi.mock('../client', () => ({
  supabase: { from: (t: string) => ({ table: t, select: () => null }) },
}));

import { untypedFrom, untypedSupabase } from '../untyped';

describe('untyped', () => {
  it('returns supabase chain', () => {
    expect(untypedFrom('pipeline_errors')).toBeDefined();
  });
  it('exposes client', () => {
    expect(untypedSupabase).toBeDefined();
  });
});
