import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { APIRequestContext } from '@playwright/test';

const fixture = vi.hoisted(() => ({
  authenticated: true,
  session: { access_token: 'saved-reviewer', refresh_token: 'saved-refresh' },
}));
vi.mock('node:fs/promises', () => {
  const readFile = async () =>
    JSON.stringify({
      origins: [
        {
          origin: 'https://queer.guide',
          localStorage: [{ name: 'sb-probe-auth-token', value: JSON.stringify(fixture.session) }],
        },
      ],
    });
  return { readFile, default: { readFile } };
});
vi.mock('@playwright/test', async () => ({ expect: (await import('vitest')).expect }));
vi.mock('../../e2e/support/adminAuth', () => ({
  get authenticated() {
    return fixture.authenticated;
  },
}));
vi.mock('../../e2e/support/anonKey', () => ({
  SUPABASE_REST_URL: 'https://reviewer.invalid',
  anonHeaders: async () => ({ apikey: 'public-key', Authorization: 'Bearer public-key' }),
}));

const rows = [{ slug: 'reviewer-control' }];
const response = (status: number, body: unknown = {}) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  json: async () => body,
});
const query = 'select=slug';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('E2E_BASE_URL', 'https://queer.guide');
  vi.stubEnv('E2E_ADMIN_EMAIL', '');
  vi.stubEnv('E2E_ADMIN_PASSWORD', '');
  fixture.authenticated = true;
  fixture.session = { access_token: 'saved-reviewer', refresh_token: 'saved-refresh' };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function read(get: ReturnType<typeof vi.fn>, post = vi.fn()) {
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    const result = await post(url, options);
    return { ok: result.ok(), json: result.json };
  });
  const { reviewerTagRows } = await import('../../e2e/support/reviewerRegistry');
  // No POST method: a credential request through the traced context must fail.
  return reviewerTagRows({ get } as unknown as APIRequestContext, query);
}

it('uses a valid reviewer token without renewing', async () => {
  const get = vi.fn().mockResolvedValue(response(200, rows));
  const post = vi.fn();
  expect(await read(get, post)).toEqual(rows);
  expect(get.mock.calls[0][1].headers.Authorization).toBe('Bearer saved-reviewer');
  expect(post).not.toHaveBeenCalled();
});

it('renews an external storage session once after 401 and caches the renewed token', async () => {
  const get = vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValue(response(200, rows));
  const post = vi.fn().mockResolvedValue(response(200, { access_token: 'renewed-reviewer' }));
  expect(await read(get, post)).toEqual(rows);
  expect(await read(get, post)).toEqual(rows);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]).toEqual([
    'https://reviewer.invalid/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      headers: {
        apikey: 'public-key',
        Authorization: 'Bearer public-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: 'saved-refresh' }),
      signal: expect.any(AbortSignal),
    },
  ]);
  expect(get.mock.calls[2][1].headers.Authorization).toBe('Bearer renewed-reviewer');
});

it('uses CI reviewer credentials instead of a potentially rotated saved refresh token', async () => {
  vi.stubEnv('E2E_ADMIN_EMAIL', 'reviewer@example.invalid');
  vi.stubEnv('E2E_ADMIN_PASSWORD', 'fake-password');
  const get = vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValue(response(200, rows));
  const post = vi.fn().mockResolvedValue(response(200, { access_token: 'new-reviewer' }));
  expect(await read(get, post)).toEqual(rows);
  expect(post.mock.calls[0][0]).toContain('grant_type=password');
  expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({
    email: 'reviewer@example.invalid',
    password: 'fake-password',
  });
  expect(get.mock.calls[1][1].headers.Authorization).toBe('Bearer new-reviewer');
});

it('does not renew a policy denial', async () => {
  const get = vi.fn().mockResolvedValue(response(403));
  const post = vi.fn();
  await expect(read(get, post)).rejects.toThrow('Reviewer glossary registry must be readable');
  expect(get).toHaveBeenCalledTimes(1);
  expect(post).not.toHaveBeenCalled();
});

it('fails without an anonymous fallback when renewal is rejected', async () => {
  const get = vi.fn().mockResolvedValue(response(401));
  const post = vi.fn().mockResolvedValue(response(400, { message: 'private-token-details' }));
  await expect(read(get, post)).rejects.toThrow(/^Configured reviewer session renewal failed$/);
  expect(get).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
});

it('rejects a renewal response without a usable access token', async () => {
  const get = vi.fn().mockResolvedValue(response(401));
  const post = vi.fn().mockResolvedValue(response(200, { access_token: '' }));
  await expect(read(get, post)).rejects.toThrow('returned no access token');
  expect(get).toHaveBeenCalledTimes(1);
});

it('does not loop if the renewed reviewer token is rejected', async () => {
  const get = vi.fn().mockResolvedValue(response(401));
  const post = vi.fn().mockResolvedValue(response(200, { access_token: 'still-rejected' }));
  await expect(read(get, post)).rejects.toThrow('Reviewer glossary registry must be readable');
  expect(get).toHaveBeenCalledTimes(2);
  expect(post).toHaveBeenCalledTimes(1);
});

it('redacts network errors during renewal', async () => {
  const get = vi.fn().mockResolvedValue(response(401));
  const post = vi.fn().mockRejectedValue(new Error('private-request-body'));
  await expect(read(get, post)).rejects.toThrow(/^Configured reviewer session renewal failed$/);
});

it('preserves anonymous reads without attempting reviewer authentication', async () => {
  fixture.authenticated = false;
  const get = vi.fn().mockResolvedValue(response(200, rows));
  const post = vi.fn();
  expect(await read(get, post)).toEqual(rows);
  expect(get.mock.calls[0][1].headers.Authorization).toBe('Bearer public-key');
  expect(post).not.toHaveBeenCalled();
});

it('fails clearly when expired storage has no renewal credentials', async () => {
  fixture.session.refresh_token = '';
  const get = vi.fn().mockResolvedValue(response(401));
  const post = vi.fn();
  await expect(read(get, post)).rejects.toThrow('expired and cannot be renewed');
  expect(post).not.toHaveBeenCalled();
});
