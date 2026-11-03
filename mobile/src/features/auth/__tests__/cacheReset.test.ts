jest.mock('@/lib/supabase', () => ({ supabase: {} }));
import type { Session } from '@supabase/supabase-js';
import { shouldResetCache } from '../cacheReset';

const s = (id: string) => ({ user: { id } }) as Session;

it('drops cached queries on sign-out, so gated places do not stay on screen', () => {
  expect(shouldResetCache('SIGNED_OUT', 'u1', null)).toBe(true);
});

it('drops them when a different user signs in', () => {
  expect(shouldResetCache('SIGNED_IN', null, s('u1'))).toBe(true);
  expect(shouldResetCache('SIGNED_IN', 'u1', s('u2'))).toBe(true);
});

it('keeps them across token refreshes and same-user events', () => {
  expect(shouldResetCache('TOKEN_REFRESHED', 'u1', s('u1'))).toBe(false);
  expect(shouldResetCache('SIGNED_IN', 'u1', s('u1'))).toBe(false);
});
