const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const mockCalls: { op: string; args: unknown[] }[] = [];
let mockDeleteError: Error | null = null;
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: async (...args: unknown[]) => {
        mockCalls.push({ op: `upsert:${table}`, args });
        return { error: null };
      },
      delete: () => ({
        eq: async (...args: unknown[]) => {
          mockCalls.push({ op: `delete:${table}`, args });
          return { error: mockDeleteError };
        },
      }),
    }),
  },
}));

import { disablePush, enablePush, readRecord, unregisterBeforeSignOut, type PushDeps } from '../push';

const deps = (over: Partial<PushDeps> = {}): PushDeps & { unregisterDevice: jest.Mock } => ({
  requestPermission: async () => true,
  getDeviceToken: async () => 'tok-1',
  unregisterDevice: jest.fn(async () => {}),
  ...over,
} as PushDeps & { unregisterDevice: jest.Mock });

beforeEach(() => {
  mockStore.clear();
  mockCalls.length = 0;
  mockDeleteError = null;
});

it('registers the native token for the signed-in user', async () => {
  expect(await enablePush('u1', deps(), 'ios')).toBe('enabled');
  expect(mockCalls[0]?.op).toBe('upsert:user_push_tokens');
  expect(mockCalls[0]?.args[0]).toMatchObject({ user_id: 'u1', token: 'tok-1', platform: 'ios' });
  expect(await readRecord()).toEqual({ userId: 'u1', token: 'tok-1' });
});

it('writes nothing when permission is refused or no token is available', async () => {
  expect(await enablePush('u1', deps({ requestPermission: async () => false }))).toBe('denied');
  expect(
    await enablePush('u1', deps({ getDeviceToken: async () => Promise.reject(new Error('no fcm')) })),
  ).toBe('unavailable');
  expect(mockCalls).toEqual([]);
  expect(await readRecord()).toBeNull();
});

it('replaces a rotated token instead of keeping both', async () => {
  await enablePush('u1', deps(), 'ios');
  await enablePush('u1', deps({ getDeviceToken: async () => 'tok-2' }), 'ios');
  expect(mockCalls.map((c) => c.op)).toEqual([
    'upsert:user_push_tokens',
    'delete:user_push_tokens',
    'upsert:user_push_tokens',
  ]);
  expect(mockCalls[1]?.args).toEqual(['token', 'tok-1']);
});

describe('before sign-out', () => {
  it('kills the device token and deletes its row', async () => {
    await enablePush('u1', deps(), 'ios');
    const d = deps();
    await unregisterBeforeSignOut(d);
    expect(d.unregisterDevice).toHaveBeenCalled();
    expect(mockCalls.at(-1)).toEqual({ op: 'delete:user_push_tokens', args: ['token', 'tok-1'] });
    expect(await readRecord()).toBeNull();
  });

  it('still kills the device token offline, and never blocks the sign-out', async () => {
    await enablePush('u1', deps(), 'ios');
    mockDeleteError = new Error('Network request failed');
    const d = deps();
    await expect(unregisterBeforeSignOut(d)).resolves.toBeUndefined();
    expect(d.unregisterDevice).toHaveBeenCalled();
  });

  it('does nothing when notifications were never turned on', async () => {
    const d = deps();
    await unregisterBeforeSignOut(d);
    expect(d.unregisterDevice).not.toHaveBeenCalled();
    expect(mockCalls).toEqual([]);
  });
});

it('turning notifications off removes the row and the local record', async () => {
  await enablePush('u1', deps(), 'android');
  await disablePush(deps());
  expect(mockCalls.at(-1)?.op).toBe('delete:user_push_tokens');
  expect(await readRecord()).toBeNull();
});
