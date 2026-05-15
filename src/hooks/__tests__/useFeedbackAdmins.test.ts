import { describe, it, expect } from 'vitest';
import { buildAdminMap } from '../useFeedbackAdmins';

describe('buildAdminMap', () => {
  it('returns an empty map for empty input', () => {
    expect(buildAdminMap([])).toEqual({});
  });

  it('keys profiles by user_id', () => {
    const a = { user_id: 'u1', display_name: 'A', avatar_url: null };
    const b = { user_id: 'u2', display_name: 'B', avatar_url: 'b.png' };
    expect(buildAdminMap([a, b])).toEqual({ u1: a, u2: b });
  });

  it('keeps the last entry when duplicate user_ids are passed', () => {
    const a1 = { user_id: 'u1', display_name: 'A1', avatar_url: null };
    const a2 = { user_id: 'u1', display_name: 'A2', avatar_url: null };
    expect(buildAdminMap([a1, a2])).toEqual({ u1: a2 });
  });
});
