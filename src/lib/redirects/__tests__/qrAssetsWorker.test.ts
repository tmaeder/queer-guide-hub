import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect, vi } from 'vitest';
import {
  qrAssetStorageConfig,
  dispatchRedirectQrAssetCleanup,
} from '../../../../supabase/functions/_shared/redirect-qr-assets';
function runtime() {
  const root = '../../../../supabase/functions/';
  const auth = (
    readFileSync(new URL(root + '_shared/timing-safe.ts', import.meta.url), 'utf8') +
    readFileSync(new URL(root + '_shared/supabase-client.ts', import.meta.url), 'utf8')
  )
    .replace(/^import .*$/gm, '')
    .replace(/^export\s+/gm, '');
  const worker = readFileSync(
    new URL(root + 'redirect-qr-assets-cleanup/index.ts', import.meta.url),
    'utf8',
  ).replace(/^import[\s\S]*?;[ \t]*(?:\n|$)/gm, '');
  const code = ts.transpileModule(auth + '\n' + worker, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  let handler!: (req: Request) => Promise<Response>;
  const state = { user: true, admin: false, claimError: false };
  const rpc = vi.fn(async () => ({
    data: [],
    error: state.claimError ? { message: 'PRIVATE DATABASE FAILURE' } : null,
  }));
  const client = {
    rpc,
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: 'account', user_metadata: { role: 'admin' } } : null },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: state.admin ? { role: 'admin' } : null, error: null }),
          }),
        }),
      }),
    }),
  };
  new Function(
    'Deno',
    'createClient',
    'qrAssetStorageConfig',
    'dispatchRedirectQrAssetCleanup',
    code,
  )(
    {
      env: {
        get: (key: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'INTERNAL_INVOKE_SECRET') =>
          (
            ({
              SUPABASE_URL: 'https://fixture.supabase.co',
              SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
              INTERNAL_INVOKE_SECRET: 'fixture-internal',
            }) as Record<string, string>
          )[key],
      },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    () => client,
    qrAssetStorageConfig,
    dispatchRedirectQrAssetCleanup,
  );
  return {
    state,
    rpc,
    invoke: (headers: Record<string, string> = {}, method = 'POST') =>
      handler(
        new Request('https://fixture.supabase.co/functions/v1/redirect-qr-assets-cleanup', {
          method,
          headers,
        }),
      ),
  };
}
describe('scheduled QR asset cleanup authorization', () => {
  it('rejects unauthenticated callers, member accounts and user-editable role metadata', async () => {
    const run = runtime();
    expect((await run.invoke()).status).toBe(401);
    expect((await run.invoke({ Authorization: 'Bearer account-session' })).status).toBe(403);
    expect((await run.invoke({ 'x-internal-secret': 'wrong' })).status).toBe(401);
    expect(run.rpc).not.toHaveBeenCalled();
  });
  it('allows the configured internal secret and authenticated workspace administrators', async () => {
    const run = runtime();
    expect((await run.invoke({ 'x-internal-secret': 'fixture-internal' })).status).toBe(200);
    expect(run.rpc).toHaveBeenCalledWith(
      'claim_redirect_qr_asset_cleanup',
      expect.objectContaining({ p_limit: 3 }),
    );
    run.state.admin = true;
    expect((await run.invoke({ Authorization: 'Bearer account-session' })).status).toBe(200);
  });
  it('sanitizes cleanup database failures', async () => {
    const run = runtime();
    run.state.claimError = true;
    const failed = await run.invoke({ 'x-internal-secret': 'fixture-internal' });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('PRIVATE DATABASE FAILURE');
  });
});
