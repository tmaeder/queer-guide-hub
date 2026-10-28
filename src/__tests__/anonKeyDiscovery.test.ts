import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { APIRequestContext } from '@playwright/test';

vi.mock('@playwright/test', async () => ({ expect: (await import('vitest')).expect }));

const token = (role: string) =>
  [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ role, ref: 'synthetic-probe' })).toString('base64url'),
    'synthetic-signature-for-unit-tests',
  ].join('.');
const anon = token('anon');

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

async function discover(
  files: Record<string, string | { body: string; type: string; status?: number }>,
) {
  const get = vi.fn(async (path: string) => {
    const file = files[path];
    const body = typeof file === 'string' ? file : (file?.body ?? '');
    const type =
      typeof file === 'string'
        ? path === '/'
          ? 'text/html'
          : 'application/javascript'
        : (file?.type ?? 'text/html');
    return {
      ok: () => Boolean(file) && (typeof file === 'string' || (file.status ?? 200) < 400),
      headers: () => ({ 'content-type': type }),
      text: async () => body,
    };
  });
  const { resolveAnonKey } = await import('../../e2e/support/anonKey');
  return { key: await resolveAnonKey({ get } as unknown as APIRequestContext), get };
}

it('honors an explicit public-key override without requesting assets', async () => {
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'configured-public-key');
  const { key, get } = await discover({});
  expect(key).toBe('configured-public-key');
  expect(get).not.toHaveBeenCalled();
});

it('still discovers a key directly in an entry script', async () => {
  const { key } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': `const key="${anon}";`,
  });
  expect(key).toBe(anon);
});

it('follows deferred bootstrap imports to the deployed public client configuration', async () => {
  const { key, get } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': 'import("./app-bootstrap.js");',
    '/assets/js/app-bootstrap.js': 'import{client}from"./client.js";',
    '/assets/js/client.js': `export const key="${anon}";`,
  });
  expect(key).toBe(anon);
  expect(get.mock.calls.map(([path]) => path)).toEqual([
    '/',
    '/assets/js/main.js',
    '/assets/js/app-bootstrap.js',
    '/assets/js/client.js',
  ]);
});

it('accepts bare imports, re-exports and cache queries', async () => {
  const { key } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': 'import "./bridge.js";',
    '/assets/js/bridge.js': "export{key}from'/assets/js/client.js?release=probe';",
    '/assets/js/client.js?release=probe': `export const key="${anon}";`,
  });
  expect(key).toBe(anon);
});

it('never uses authenticated or service-role tokens as the anonymous key', async () => {
  const { key } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': `const a="${token('authenticated')}";const b="${token('service_role')}";import('./client.js');`,
    '/assets/js/client.js': `export const key="${anon}";`,
  });
  expect(key).toBe(anon);
});

it('does not follow external origins or paths outside the asset directory', async () => {
  const { key, get } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js':
      'import("https://outside.invalid/assets/js/a.js");import("//outside.invalid/assets/js/b.js");import("../../api/private.js");',
  });
  expect(key).toBeNull();
  expect(get.mock.calls.map(([path]) => path)).toEqual(['/', '/assets/js/main.js']);
});

it('skips HTML fallback responses even if they contain a JWT or module-like text', async () => {
  const { key, get } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': { body: `${anon} import('./client.js');`, type: 'text/html' },
    '/assets/js/client.js': `const key="${anon}";`,
  });
  expect(key).toBeNull();
  expect(get).toHaveBeenCalledTimes(2);
});

it('rejects failed JavaScript responses containing token-shaped text', async () => {
  const { key } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': { body: anon, type: 'application/javascript', status: 403 },
  });
  expect(key).toBeNull();
});

it('deduplicates cyclic imports', async () => {
  const { key, get } = await discover({
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': 'import "./main.js"; import "./other.js"; import "./other.js";',
    '/assets/js/other.js': 'import "./main.js";',
  });
  expect(key).toBeNull();
  expect(get).toHaveBeenCalledTimes(3);
});

it('bounds the number of public asset requests when no key is present', async () => {
  const files: Record<string, string> = {
    '/': '<script src="/assets/js/main.js"></script>',
    '/assets/js/main.js': Array.from({ length: 200 }, (_, i) => `import "./part${i}.js";`).join(''),
  };
  for (let i = 0; i < 200; i++) files[`/assets/js/part${i}.js`] = '// No key';
  const { key, get } = await discover(files);
  expect(key).toBeNull();
  expect(get.mock.calls.filter(([path]) => path !== '/').length).toBeLessThanOrEqual(64);
});

it('bounds import depth rather than walking an unlimited application graph', async () => {
  const files: Record<string, string> = { '/': '<script src="/assets/js/part0.js"></script>' };
  for (let i = 0; i < 20; i++) files[`/assets/js/part${i}.js`] = `import "./part${i + 1}.js";`;
  const { key, get } = await discover(files);
  expect(key).toBeNull();
  expect(get.mock.calls.length).toBeLessThan(10);
});
