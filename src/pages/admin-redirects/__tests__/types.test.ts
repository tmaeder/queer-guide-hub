import { describe, it, expect } from 'vitest';
import { SUPABASE_URL } from '../types';

describe('admin-redirects/types', () => {
  it('SUPABASE_URL is a URL string', () => {
    expect(SUPABASE_URL).toMatch(/^https:\/\//);
  });
});
