import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

/** Execute the real Deno handler with its SDK boundary stubbed; no database writes. */
describe('short-link visit recording', () => {
  it('records a GET visit but resolves HEAD without incrementing clicks or using quota', async () => {
    const source = readFileSync(
      join(__dirname, '../../../../supabase/functions/redirect-handler/index.ts'),
      'utf8',
    ).replace(/^import .*;\s*$/gm, '');
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => ({
      error: null,
      data:
        name === 'resolve_short_redirect'
          ? [
              {
                id: 'fixture',
                target: '/events/pride?utm_campaign=poster#details',
                status_code: 302,
                query_mode: 'PRESERVE',
                query_override: null,
                utm_defaults: null,
              },
            ]
          : null,
    }));
    const deno = {
      env: {
        get: (key: string) =>
          key === 'SUPABASE_URL' ? 'https://fixture.supabase.co' : 'fixture-key',
      },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    };
    new Function('Deno', 'createClient', 'crypto', code)(deno, () => ({ rpc }), webcrypto);
    const head = await handler!(
      new Request(
        'https://fixture.supabase.co/functions/v1/redirect-handler?slug=pride-qr&q=utm_source%3Dqr',
        { method: 'HEAD', headers: { 'x-qg-visitor-country': 'CH', 'cf-ipcountry': 'US' } },
      ),
    );
    expect(head.status).toBe(302);
    expect(head.headers.get('Location')).toBe(
      'https://queer.guide/events/pride?utm_campaign=poster&utm_source=qr#details',
    );
    expect(rpc.mock.calls.filter(([name]) => name === 'record_redirect_click')).toHaveLength(0);
    const get = await handler!(
      new Request(
        'https://fixture.supabase.co/functions/v1/redirect-handler?slug=pride-qr&q=utm_source%3Dqr',
        { headers: { 'x-qg-visitor-country': 'CH', 'cf-ipcountry': 'US' } },
      ),
    );
    expect(get.status).toBe(302);
    expect(rpc.mock.calls.filter(([name]) => name === 'record_redirect_click')).toHaveLength(1);
    expect(rpc.mock.calls.find(([name]) => name === 'record_redirect_click')?.[1]?.p_country).toBe(
      'CH',
    );
  });
});
