import { describe, it, expect } from 'vitest';
import { supabase } from '../client';

describe('supabase client', () => {
  it('exports a client with from()', () => {
    expect(typeof supabase.from).toBe('function');
  });
  it('exports auth namespace', () => {
    expect(supabase.auth).toBeDefined();
  });
});
