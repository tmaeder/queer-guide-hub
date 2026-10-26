import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashLinkPassword } from '../../../../supabase/functions/_shared/link-policy';

import domainWorker from '../../../../workers/redirect-domains/index';
const domainSecret = 'fixture-domain-secret-'.repeat(3);
afterEach(() => vi.unstubAllGlobals());
function runtime() {
  const source = readFileSync(
    join(__dirname, '../../../../supabase/functions/redirect-handler/index.ts'),
    'utf8',
  ).replace(/^import .*;\s*$/gm, '');
  const shared = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/link-policy.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const visitor = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-visitor.ts'),
    'utf8',
  )
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  const visitorGeo = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-visitor-geo.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const relay = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-relay.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const passwordPage = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-password-page.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const presentation = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-presentation.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const domainRelay = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-domain-relay.ts'),
    'utf8',
  ).replace(/^export\s+/gm, '');
  const nativeResolution = readFileSync(
    join(__dirname, '../../../../supabase/functions/_shared/redirect-native-resolution.ts'),
    'utf8',
  )
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  const install = ['redirect-native-install-browser.ts', 'redirect-native-install-page.ts']
    .map((file) =>
      readFileSync(join(__dirname, '../../../../supabase/functions/_shared/' + file), 'utf8')
        .replace(/^import .*;\s*$/gm, '')
        .replace(/^export\s+/gm, ''),
    )
    .join('\n');
  const code = ts.transpileModule(
    nativeResolution +
      '\n' +
      shared +
      '\n' +
      visitorGeo +
      '\n' +
      visitor +
      '\n' +
      relay +
      '\n' +
      passwordPage +
      '\n' +
      presentation +
      '\n' +
      domainRelay +
      '\n' +
      install +
      '\n' +
      source,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    },
  ).outputText;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const state = {
    link: {
      id: 'fixture',
      is_domain_root: false,
      target: 'https://example.com/pride?utm_campaign=poster#details',
      status_code: 302,
      query_mode: 'PRESERVE',
      query_override: null,
      utm_defaults: null,
      is_enabled: true,
      start_at: null,
      end_at: null as string | null,
      click_count: 0,
      click_limit: null as number | null,
    },
    domain: null as null | {
      id: string;
      hostname: string;
      rootUrl: string | null;
      notFoundUrl: string | null;
      expiredUrl: string | null;
    },
    managedTarget: false,
    domainFailure: false,
    filters: [] as Array<[string, string, unknown]>,
    settings: { policy: {}, password_hash: null as unknown },
    failed: false,
    quota: true,
    retry: 0,
    attemptError: false,
    branding: null as unknown,
    brandingError: false,
  };
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => ({
    error:
      (name === 'redirect_password_branding_public' && state.brandingError) ||
      (name === 'reserve_redirect_password_attempt' && state.attemptError) ||
      (name === 'redirect_public_domain' && state.domainFailure) ||
      (name === 'redirect_resolution_snapshot' && state.failed)
        ? { message: 'offline' }
        : null,
    data:
      name === 'redirect_resolution_snapshot'
        ? _args?.p_root === state.link.is_domain_root
          ? { link: state.link, settings: state.settings, fingerprint: 'a'.repeat(64) }
          : null
        : name === 'redirect_password_branding_public'
          ? state.branding
          : name === 'redirect_public_domain'
            ? state.domain
            : name === 'record_redirect_domain_route'
              ? !!state.domain
              : name === 'reserve_redirect_password_attempt'
                ? state.retry
                : name === 'record_redirect_snapshot_visit'
                  ? state.quota
                    ? '10000000-0000-4000-8000-000000000001'
                    : null
                  : [],
  }));
  const db = {
    rpc,
    from: (table: string) => {
      let rootFilter = false;
      const query = {
        select() {
          return query;
        },
        is(key: string, value: unknown) {
          state.filters.push([table, key, value]);
          return query;
        },
        eq(key: string, value: unknown) {
          if (key === 'is_domain_root') rootFilter = value === true;
          state.filters.push([table, key, value]);
          return query;
        },
        async maybeSingle() {
          return {
            error: state.failed ? { message: 'offline' } : null,
            data:
              table === 'redirects'
                ? rootFilter === state.link.is_domain_root
                  ? state.link
                  : null
                : table === 'redirect_domains'
                  ? state.managedTarget
                    ? { id: 'managed' }
                    : null
                  : state.settings,
          };
        },
      };
      return query;
    },
  };
  const deno = {
    env: {
      get: (key: string) =>
        key === 'SUPABASE_URL'
          ? 'https://fixture.supabase.co'
          : key === 'REDIRECT_RELAY_SECRET'
            ? domainSecret
            : 'fixture-key',
    },
    serve: (callback: typeof handler) => {
      handler = callback;
    },
  };
  new Function('Deno', 'createClient', 'crypto', code)(deno, () => db, webcrypto);
  return {
    state,
    rpc,
    handle: (request: Request) => handler!(request),
    invoke: (method = 'GET', query = 'utm_source=qr', body?: string, agent = '') =>
      handler!(
        new Request(
          'https://fixture.supabase.co/functions/v1/redirect-handler?slug=pride-qr&q=' +
            encodeURIComponent(query),
          {
            method,
            headers: {
              'x-qg-visitor-country': 'CH',
              'cf-ipcountry': 'US',
              'user-agent': agent,
              ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
            },
            body,
          },
        ),
      ),
  };
}
describe('live short-link resolver', () => {
  it.each([
    ['/events/pride?utm_campaign=poster#details', 'https://queer.guide'],
    ['HTTPS://www.queer.guide/events/pride?utm_campaign=poster#details', 'https://www.queer.guide'],
    ['HTTPS:/www.queer.guide/events/pride?utm_campaign=poster#details', 'https://www.queer.guide'],
  ])('preserves normalized target %s with HEAD and GET', async (target, origin) => {
    const run = runtime();
    run.state.link.target = target;
    const head = await run.invoke('HEAD');
    expect(head.status).toBe(302);
    expect(head.headers.get('Location')).toBe(
      `${origin}/events/pride?utm_campaign=poster&utm_source=qr#details`,
    );
    expect(
      run.rpc.mock.calls.filter(([name]) => name !== 'redirect_resolution_snapshot'),
    ).toHaveLength(0);
    const get = await run.invoke();
    expect(get.headers.get('Location')).toBe(head.headers.get('Location'));
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
  });
  it('records GET and visitor context, but HEAD does not count or consume quota', async () => {
    const run = runtime();
    const head = await run.invoke('HEAD');
    expect(head.status).toBe(302);
    expect(head.headers.get('Location')).toBe(
      'https://example.com/pride?utm_campaign=poster&utm_source=qr#details',
    );
    expect(
      run.rpc.mock.calls.filter(([name]) => name !== 'redirect_resolution_snapshot'),
    ).toHaveLength(0);
    expect((await run.invoke()).status).toBe(302);
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1]
        ?.p_country,
    ).toBe('CH');
  });
  it('does not disclose destinations or record invalid password attempts, and strips password query values', async () => {
    const run = runtime();
    vi.stubGlobal('crypto', webcrypto);
    run.state.settings.password_hash = await hashLinkPassword('fixture password');
    vi.unstubAllGlobals();
    const denied = await run.invoke('GET', 'pw=wrong');
    expect(denied.status).toBe(401);
    expect(denied.headers.has('Location')).toBe(false);
    expect(await denied.text()).not.toContain('example.com');
    expect(
      run.rpc.mock.calls
        .filter(([name]) => name !== 'redirect_resolution_snapshot')
        .map(([name]) => name),
    ).toEqual(['redirect_password_branding_public', 'reserve_redirect_password_attempt']);
    const allowed = await run.invoke('GET', 'pw=fixture+password&utm_source=qr');
    expect(allowed.status).toBe(302);
    expect(allowed.headers.get('Location')).not.toContain('pw=');
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1]?.p_query,
    ).toBe('utm_source=qr');
    expect((await run.invoke('POST', 'utm_source=qr', 'password=fixture+password')).status).toBe(
      303,
    );
  });
  it('returns Retry-After without a target on exhausted attempts and fails closed on limiter errors', async () => {
    const run = runtime();
    vi.stubGlobal('crypto', webcrypto);
    run.state.settings.password_hash = await hashLinkPassword('fixture password');
    vi.unstubAllGlobals();
    expect((await run.invoke('HEAD', 'pw=fixture+password')).status).toBe(401);
    expect((await run.invoke('GET', '')).status).toBe(401);
    expect(
      run.rpc.mock.calls.filter(([name]) =>
        ['reserve_redirect_password_attempt', 'record_redirect_snapshot_visit'].includes(name),
      ),
    ).toHaveLength(0);
    run.state.retry = 601;
    const blocked = await run.invoke('POST', '', 'password=fixture+password');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('601');
    expect(blocked.headers.has('Location')).toBe(false);
    expect(await blocked.text()).not.toContain('example.com');
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
    run.state.attemptError = true;
    expect((await run.invoke('GET', 'pw=anything')).status).toBe(503);
  });
  it('brands challenges and quota failures without exposing targets, and keeps the form on decoration failures', async () => {
    const run = runtime();
    vi.stubGlobal('crypto', webcrypto);
    run.state.settings.password_hash = await hashLinkPassword('fixture password');
    vi.unstubAllGlobals();
    const id = 'd0000000-0000-4000-8000-000000000001';
    run.state.branding = {
      brandName: 'Community & <friends>',
      logoAsset: {
        id,
        key: id + '.png',
        mime: 'image/png',
        bytes: 100,
        width: 64,
        height: 64,
        sha256: 'a'.repeat(64),
      },
    };
    const challenge = await run.invoke('GET', '');
    const html = await challenge.text();
    expect(challenge.status).toBe(401);
    expect(html).toContain('Community &amp; &lt;friends&gt;');
    expect(html).toContain(id + '.png');
    expect(html).not.toContain('example.com');
    run.state.retry = 601;
    const limited = await run.invoke('POST', '', 'password=wrong');
    expect(limited.status).toBe(429);
    expect(await limited.text()).toContain('Community &amp; &lt;friends&gt;');
    expect(limited.headers.has('Location')).toBe(false);
    run.state.brandingError = true;
    const generic = await run.invoke('GET', '');
    expect(generic.status).toBe(401);
    expect(await generic.text()).toContain('name="password"');
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
  });
  it('serves custom unfurl metadata without visits, and never reveals protected previews', async () => {
    const run = runtime();
    run.state.settings.policy = {
      preview: {
        title: 'Community preview',
        description: 'Join us',
        image: 'https://example.com/art.png',
      },
    };
    const preview = await run.invoke('GET', '', undefined, 'Twitterbot/1.0');
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('Community preview');
    expect(
      run.rpc.mock.calls.filter(([name]) => name !== 'redirect_resolution_snapshot'),
    ).toHaveLength(0);
    expect((await run.invoke()).status).toBe(302);
    vi.stubGlobal('crypto', webcrypto);
    run.state.settings.password_hash = await hashLinkPassword('fixture password');
    vi.unstubAllGlobals();
    const denied = await run.invoke('GET', '', undefined, 'Twitterbot/1.0');
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain('Community preview');
  });
  it('records a framed visit once, forwards attribution and exposes a direct fallback', async () => {
    const run = runtime();
    run.state.settings.policy = { cloaked: true, track_conversions: true };
    const result = await run.invoke();
    expect(result.status).toBe(200);
    const html = await result.text();
    expect(html).toContain('<iframe');
    expect(html).toContain('qg_click_id=10000000-0000-4000-8000-000000000001');
    expect(html).toContain('Open destination directly');
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
    expect((await run.invoke('HEAD')).status).toBe(200);
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
    run.state.link.target = 'http://example.com/plain';
    expect((await run.invoke()).status).toBe(503);
  });
  it('uses live state instead of a stale cached rule and never tracks expired fallbacks', async () => {
    const run = runtime();
    expect((await run.invoke()).status).toBe(302);
    run.state.link.is_enabled = false;
    expect((await run.invoke()).status).toBe(404);
    run.state.link.is_enabled = true;
    run.state.link.end_at = '2000-01-01T00:00:00Z';
    run.state.settings.policy = { expired_target: '/expired' };
    expect((await run.invoke()).headers.get('Location')).toBe(
      'https://queer.guide/expired?utm_source=qr',
    );
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
  });
  it('fails closed on missing policy data and on an atomically exhausted quota', async () => {
    const run = runtime();
    run.state.failed = true;
    expect((await run.invoke()).status).toBe(503);
    run.state.failed = false;
    run.state.quota = false;
    expect((await run.invoke()).status).toBe(410);
  });
  it('adds only the recorded click ID when conversion tracking is enabled, and never annotates HEAD', async () => {
    const run = runtime();
    run.state.settings.policy = { track_conversions: true };
    const head = await run.invoke('HEAD', 'qg_click_id=spoofed&utm_source=qr');
    expect(head.headers.get('Location')).not.toContain('qg_click_id');
    const get = await run.invoke('GET', 'qg_click_id=spoofed&utm_source=qr');
    expect(new URL(get.headers.get('Location')!).searchParams.get('qg_click_id')).toBe(
      '10000000-0000-4000-8000-000000000001',
    );
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1]?.p_query,
    ).toBe('utm_source=qr');
  });
  it('records QR source as visitor metadata and removes it from the destination/query', async () => {
    const run = runtime();
    const response = await run.invoke('GET', 'qg_qr=1&utm_source=poster');
    expect(response.headers.get('Location')).not.toContain('qg_qr');
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1]
        ?.p_metadata,
    ).toMatchObject({
      is_qr: true,
      domain: 'queer.guide',
    });
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1]?.p_query,
    ).toBe('utm_source=poster');
  });
});

describe('branded Worker → actual resolver', () => {
  const env = {
    SUPABASE_URL: 'https://fixture.supabase.co',
    SUPABASE_ANON_KEY: 'fixture-key',
    REDIRECT_RELAY_SECRET: domainSecret,
  };
  function branded() {
    const run = runtime();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => run.handle(new Request(url, options))),
    );
    run.state.domain = {
      id: 'domain-a',
      hostname: 'links.community.com',
      rootUrl: 'https://example.com/home',
      notFoundUrl: 'https://example.com/missing',
      expiredUrl: 'https://example.com/expired',
    };
    return {
      ...run,
      open: (path = '/pride-qr', method = 'GET') =>
        domainWorker.fetch(
          new Request('https://links.community.com' + path, {
            method,
            headers: { 'cf-connecting-ip': '192.0.2.1' },
          }),
          env,
        ),
    };
  }
  it('isolates builtin and custom namespaces, and records canonical branded visit context and QR attribution', async () => {
    const run = branded();
    const response = await run.open('/pride-qr?qg_qr=1&utm_source=poster');
    expect(response.status).toBe(302);
    expect(run.rpc).toHaveBeenCalledWith('redirect_resolution_snapshot', {
      p_hostname: 'links.community.com',
      p_slug: 'pride-qr',
      p_root: false,
    });
    expect(
      run.rpc.mock.calls.find(([name]) => name === 'record_redirect_snapshot_visit')?.[1],
    ).toMatchObject({
      p_path: '/pride-qr',
      p_metadata: { domain: 'links.community.com', is_qr: true },
      p_query: 'utm_source=poster',
    });
    expect(response.headers.get('Location')).not.toContain('qg_qr');
    run.state.filters = [];
    expect((await run.invoke()).status).toBe(302);
    expect(run.rpc).toHaveBeenCalledWith('redirect_resolution_snapshot', {
      p_hostname: 'queer.guide',
      p_slug: 'pride-qr',
      p_root: false,
    });
  });
  it('does not fall back to builtin links for a rejected, missing or unavailable custom domain', async () => {
    const run = branded();
    run.state.domain = null;
    expect((await run.open()).status).toBe(404);
    expect(run.state.filters).toHaveLength(0);
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
    run.state.domainFailure = true;
    expect((await run.open()).status).toBe(502);
    const forged = await run.handle(
      new Request('https://fixture.supabase.co/functions/v1/redirect-handler?slug=pride-qr', {
        headers: { 'x-qg-domain-hostname': 'links.community.com' },
      }),
    );
    expect(forged.status).toBe(404);
    expect(run.state.filters).toHaveLength(0);
  });
  it('checks routing without a link or visit, and uses domain fallbacks without recording visits', async () => {
    const run = branded();
    const health = await run.open('/.well-known/qg-redirect');
    expect(await health.json()).toEqual({ ready: true, protocol: 1 });
    expect(run.state.filters).toHaveLength(0);
    expect((await run.open('/')).headers.get('Location')).toBe('https://example.com/home');
    expect((await run.open('/invalid/path')).headers.get('Location')).toBe(
      'https://example.com/missing',
    );
    run.state.link.end_at = '2000-01-01T00:00:00Z';
    expect((await run.open()).headers.get('Location')).toBe('https://example.com/expired');
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
  });
  it('keeps protected previews private and uses the branded canonical URL for public previews', async () => {
    const run = branded();
    run.state.settings.policy = { preview: { title: 'Branded preview' } };
    const request = new Request('https://links.community.com/pride-qr', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    const preview = await domainWorker.fetch(request, env);
    expect(await preview.text()).toContain('https://links.community.com/pride-qr');
    run.state.settings.password_hash = await hashLinkPassword('fixture-password');
    const denied = await domainWorker.fetch(request, env);
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain('Branded preview');
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
  });
  it('rejects managed-domain destination loops before counting a visit', async () => {
    const run = branded();
    run.state.managedTarget = true;
    expect((await run.open()).status).toBe(502);
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
  });
});

describe('policy-aware native resolver', () => {
  const media = 'application/vnd.queer-guide.redirect+json';
  const request = (
    method = 'GET',
    password?: string,
    consent = false,
    query = '',
    agent = 'iPhone',
  ) =>
    new Request(
      'https://fixture.supabase.co/functions/v1/redirect-handler?slug=pride-qr&q=' +
        encodeURIComponent(query),
      {
        method,
        headers: {
          Accept: media,
          'User-Agent': agent,
          ...(consent ? { 'x-qg-attribution-consent': 'granted' } : {}),
          ...(password ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
        ...(password ? { body: new URLSearchParams({ password }).toString() } : {}),
      },
    );
  it('resolves through the normal visit path without exposing attribution before consent', async () => {
    const run = runtime();
    run.state.settings.policy = {
      track_conversions: true,
      device_targets: { ios: 'https://example.com/ios' },
    };
    const response = await run.handle(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(media);
    const body = await response.json();
    expect(body).toEqual({
      protocol: 1,
      canonicalUrl: 'https://queer.guide/go/pride-qr',
      destination: 'https://example.com/ios',
      statusCode: 302,
      mode: 'navigate',
      clickId: null,
    });
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
    const consented = await run.handle(request('GET', undefined, true));
    const attributed = await consented.json();
    expect(attributed.clickId).toBe('10000000-0000-4000-8000-000000000001');
    expect(new URL(attributed.destination).searchParams.get('qg_click_id')).toBe(
      attributed.clickId,
    );
  });
  it('keeps password challenges, form checks and throttling ahead of destinations', async () => {
    const run = runtime();
    run.state.settings.password_hash = await hashLinkPassword('native-password');
    const challenge = await run.handle(request());
    expect(challenge.status).toBe(401);
    expect(await challenge.json()).toEqual({ protocol: 1, error: 'password_required' });
    expect(run.rpc.mock.calls.some(([name]) => name === 'redirect_password_branding_public')).toBe(
      false,
    );
    expect((await run.handle(request('GET', undefined, false, 'pw=native-password'))).status).toBe(
      400,
    );
    expect((await run.handle(request('POST', 'wrong'))).status).toBe(401);
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
    run.state.retry = 120;
    const throttled = await run.handle(request('POST', 'native-password'));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBe('120');
    run.state.retry = 0;
    expect((await run.handle(request('POST', 'native-password'))).status).toBe(200);
  });
  it.each([301, 302, 303, 307, 308])(
    'uses a GET redirect after password submission with stored status %s',
    async (storedStatus) => {
      const run = runtime();
      run.state.link.status_code = storedStatus;
      run.state.settings.password_hash = await hashLinkPassword('native-password');
      const response = await run.invoke('POST', '', 'password=native-password');
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain('https://example.com/pride');
    },
  );
  it('keeps quotas and HEAD observational without creating additional visits', async () => {
    const run = runtime();
    expect((await run.handle(request('HEAD'))).status).toBe(200);
    expect(run.rpc.mock.calls.some(([name]) => name === 'record_redirect_snapshot_visit')).toBe(
      false,
    );
    run.state.link.click_limit = 1;
    run.state.link.click_count = 1;
    expect((await run.handle(request('HEAD'))).status).toBe(410);
    run.state.link.click_limit = null;
    run.state.quota = false;
    expect((await run.handle(request())).status).toBe(410);
  });
  it('uses a web fallback for expiry and cloaking and counts native requests with crawler agents', async () => {
    const run = runtime();
    run.state.settings.policy = { cloaked: true, preview: { title: 'Private presentation' } };
    const response = await run.handle(request('GET', undefined, false, '', 'Twitterbot'));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe('web');
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
    run.state.settings.policy = {
      expires_at: '2020-01-01T00:00:00Z',
      expired_target: 'https://example.com/expired',
    };
    const expired = await run.handle(request());
    expect((await expired.json()).mode).toBe('web');
    expect(
      run.rpc.mock.calls.filter(([name]) => name === 'record_redirect_snapshot_visit'),
    ).toHaveLength(1);
  });
});
