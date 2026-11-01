const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
};
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { get auth() { return mockAuth; }, functions: { invoke: (...a: unknown[]) => mockInvoke(...a) }, rpc: (...a: unknown[]) => mockRpc(...a) },
}));

import {
  authErrorKey,
  confirmationMatches,
  deleteAccount,
  deletionConfirmationTarget,
  signOut,
  signUp,
  validateCredentials,
} from '../api';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signUp.mockResolvedValue({ error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
});

describe('signUp', () => {
  it('sends only the three consent timestamps, like the web', async () => {
    await signUp(' a@b.ch ', 'longenough', new Date('2026-11-01T10:00:00Z'));
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'a@b.ch',
      password: 'longenough',
      options: {
        data: {
          terms_accepted_at: '2026-11-01T10:00:00.000Z',
          privacy_accepted_at: '2026-11-01T10:00:00.000Z',
          age_confirmed_at: '2026-11-01T10:00:00.000Z',
        },
      },
    });
  });
});

it('signs out of this phone only', async () => {
  await signOut();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

describe('deleteAccount', () => {
  it('calls the shared delete-account function, then drops the local session', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    await deleteAccount('mx_tobi');
    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: { confirmation: 'mx_tobi' } });
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the session when the server did not confirm deletion', async () => {
    mockInvoke.mockResolvedValue({ data: { success: false }, error: null });
    await expect(deleteAccount('mx_tobi')).rejects.toThrow();
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Confirmation does not match') });
    await expect(deleteAccount('nope')).rejects.toThrow();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });
});

describe('deletionConfirmationTarget', () => {
  it('is the username when there is one — the server compares against that', async () => {
    mockRpc.mockResolvedValue({ data: [{ username: 'mx_tobi' }], error: null });
    expect(await deletionConfirmationTarget('a@b.ch')).toBe('mx_tobi');
    expect(mockRpc).toHaveBeenCalledWith('get_my_profile');
  });

  it('falls back to the email when the profile has no username', async () => {
    mockRpc.mockResolvedValue({ data: [{ username: null }], error: null });
    expect(await deletionConfirmationTarget('a@b.ch')).toBe('a@b.ch');
  });
});

it('confirmation is case-insensitive and never matches an empty target', () => {
  expect(confirmationMatches(' MX_Tobi ', 'mx_tobi')).toBe(true);
  expect(confirmationMatches('', '')).toBe(false);
  expect(confirmationMatches('x', 'mx_tobi')).toBe(false);
});

it('validates email shape and the 8-character minimum', () => {
  expect(validateCredentials('nope', 'longenough')).toBe('email');
  expect(validateCredentials('a@b.ch', 'short')).toBe('password');
  expect(validateCredentials('a@b.ch', 'longenough')).toBeNull();
});

it('maps server errors to messages and never passes raw text through', () => {
  expect(authErrorKey({ code: 'invalid_credentials' })).toBe('invalidCredentials');
  expect(authErrorKey({ code: 'user_already_exists' })).toBe('alreadyRegistered');
  expect(authErrorKey({ code: 'weak_password' })).toBe('weakPassword');
  expect(authErrorKey({ status: 429 })).toBe('rateLimited');
  expect(authErrorKey({ code: 'captcha_failed' })).toBe('captcha');
  expect(authErrorKey({ name: 'AuthRetryableFetchError' })).toBe('network');
  expect(authErrorKey({ message: 'database exploded at row 7' })).toBe('unknown');
});
