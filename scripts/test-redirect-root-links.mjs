import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { subpathFixture } from './lib/redirect-subpath-fixture.mjs';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';
const db = await createRedirectTestDb();
await db.exec('SET ROLE service_role');
const secret = 'fixture-root-secret-'.repeat(3);
let handle;
const source = [
  '_shared/link-policy.ts',
  '_shared/redirect-native-resolution.ts',
  '_shared/redirect-native-install-browser.ts',
  '_shared/redirect-native-install-page.ts',
  '_shared/redirect-visitor-geo.ts',
  '_shared/redirect-visitor.ts',
  '_shared/redirect-relay.ts',
  '_shared/redirect-presentation.ts',
  '_shared/redirect-password-page.ts',
  '_shared/redirect-domain-relay.ts',
  'redirect-handler/index.ts',
]
  .map((file) =>
    readFileSync('supabase/functions/' + file, 'utf8')
      .replace(/^import .*;\s*$/gm, '')
      .replace(/^export\s+/gm, ''),
  )
  .join('\n');
let beforeSnapshotVisit;
const service = {
  rpc: async (name, args) => {
    try {
      if (name === 'record_redirect_snapshot_visit' && beforeSnapshotVisit) {
        const mutate = beforeSnapshotVisit;
        beforeSnapshotVisit = undefined;
        await mutate();
      }
      const entries = Object.entries(args ?? {});
      const result = await db.query(
        'SELECT public.' +
          name +
          '(' +
          entries.map(([key], i) => key + '=> $' + (i + 1)).join(',') +
          ') AS data',
        entries.map(([key, value]) =>
          ['p_metadata', 'p_operations'].includes(key) ? JSON.stringify(value) : value,
        ),
      );
      return { data: result.rows[0].data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
  from(table) {
    assert.ok(['redirects', 'redirect_link_policies', 'redirect_domains'].includes(table));
    const filters = [];
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        assert.match(key, /^[a-z_]+$/);
        filters.push([key, value]);
        return query;
      },
      is(key, value) {
        assert.equal(value, null);
        return query.eq(key, value);
      },
      async maybeSingle() {
        try {
          const result = await db.query(
            'SELECT * FROM public.' +
              table +
              ' WHERE ' +
              filters.map(([key], i) => key + ' IS NOT DISTINCT FROM $' + (i + 1)).join(' AND '),
            filters.map(([, value]) => value),
          );
          assert.ok(result.rows.length <= 1);
          return {
            data: result.rows[0] ? JSON.parse(JSON.stringify(result.rows[0])) : null,
            error: null,
          };
        } catch (error) {
          return { data: null, error };
        }
      },
    };
    return query;
  },
};
const values = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  REDIRECT_RELAY_SECRET: secret,
};
new Function(
  'Deno',
  'createClient',
  'crypto',
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText,
)(
  {
    env: { get: (key) => values[key] },
    serve: (fn) => {
      handle = fn;
    },
  },
  () => service,
  webcrypto,
);
const relayCode = ts.transpileModule(
  readFileSync('supabase/functions/_shared/redirect-domain-relay.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const relay = await import(
  'data:text/javascript;base64,' + Buffer.from(relayCode).toString('base64')
);
const sharedCache = new Map();
const sharedAllow = new Set([
  'redirect-visitor-geo',
  'redirect-domain-relay',
  'redirect-relay',
  'redirect-native-resolution',
  'redirect-app-association-proxy',
  'redirect-native-apps',
  'redirect-api',
  'link-policy',
]);
function sharedModule(id) {
  const name = id.split('/').at(-1).replace(/\.ts$/, '');
  assert.ok(sharedAllow.has(name), 'Unexpected test dependency ' + id);
  if (sharedCache.has(name)) return sharedCache.get(name);
  const exports = {};
  sharedCache.set(name, exports);
  const compiled = ts.transpileModule(
    readFileSync('supabase/functions/_shared/' + name + '.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  new Function('require', 'exports', compiled)(sharedModule, exports);
  return exports;
}
// Node requires duplex for streaming form bodies; Cloudflare does not.
async function fixtureResolve(input, init) {
  return handle(
    new Request(input, {
      ...init,
      ...(init?.body instanceof ReadableStream ? { duplex: 'half' } : {}),
    }),
  );
}
const workerExports = {};
const workerCode = ts.transpileModule(readFileSync('workers/redirect-domains/index.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
new Function('require', 'exports', 'fetch', workerCode)(
  sharedModule,
  workerExports,
  fixtureResolve,
);
const builtinExports = {};
new Function(
  'require',
  'exports',
  'fetch',
  ts.transpileModule(readFileSync('functions/go/[slug].ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
)(sharedModule, builtinExports, fixtureResolve);
const worker = workerExports.default;
const passwordCode = ts.transpileModule(
  readFileSync('supabase/functions/_shared/link-policy.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const policy = await import(
  'data:text/javascript;base64,' + Buffer.from(passwordCode).toString('base64')
);
const actor = webcrypto.randomUUID();
await db.query('INSERT INTO auth.users(id) VALUES($1)', [actor]);
await db.query("INSERT INTO public.user_roles VALUES($1,'admin')", [actor]);
const domain = (
  await db.query(
    'SELECT public.redirect_domain_resource(\'create\',$1,p_values=>\'{"hostname":"root-http.example.com","rootUrl":"https://example.org/legacy"}\') AS d',
    [actor],
  )
).rows[0].d;
await db.query(
  "UPDATE public.redirect_domains SET ownership_state='verified',verified_at=now(),verified_until=now()+interval '1 day',provider_id='fixture-root',routing_provider_id='fixture-root',routing_protocol=1,routing_seen_at=now() WHERE id=$1",
  [domain.id],
);
await db.query(
  "INSERT INTO public.redirect_domain_jobs(domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at) VALUES($1,repeat('a',32),'links.queer.guide',$2,'ready','active','active',now())",
  [domain.id, actor],
);
async function open(path = '/', { method = 'GET', password, agent = 'Fixture browser' } = {}) {
  return worker.fetch(
    new Request('https://root-http.example.com' + path, {
      method,
      headers: {
        'cf-connecting-ip': '192.0.2.15',
        'User-Agent': agent,
        ...(password ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(password ? { body: new URLSearchParams({ password }).toString() } : {}),
    }),
    {
      SUPABASE_URL: values.SUPABASE_URL,
      SUPABASE_ANON_KEY: 'fixture-public',
      REDIRECT_RELAY_SECRET: secret,
    },
  );
}

async function total() {
  return (await db.query('SELECT click_count FROM public.redirects WHERE id=$1', [root.id])).rows[0]
    .click_count;
}
assert.equal((await open()).headers.get('Location'), 'https://example.org/legacy');
const created = await service.rpc('redirect_management_mutate', {
  p_operations: [
    {
      operation: 'create',
      data: {
        domainId: domain.id,
        isDomainRoot: true,
        target: 'https://example.org/home',
        clickLimit: 2,
      },
    },
  ],
  p_actor_id: actor,
});
assert.equal(created.error, null);
const root = created.data[0].link;
assert.equal(root.shortUrl, 'https://root-http.example.com/');
await db.query(
  'INSERT INTO public.redirect_link_policies(redirect_id,policy,password_hash) VALUES($1,$2,$3)',
  [
    root.id,
    JSON.stringify({
      track_conversions: true,
      device_targets: { ios: 'https://example.org/ios' },
      preview: { title: 'Root preview' },
    }),
    JSON.stringify(await policy.hashLinkPassword('fixture-root-password')),
  ],
);
const passwordBrand = (
  await db.query(
    'SELECT public.redirect_password_branding_resource(\'patch\',$1,NULL,$2,\'{"version":null,"brandName":"Community & <root>"}\'::jsonb) AS value',
    [actor, root.id],
  )
).rows[0].value;
const passwordAsset = (
  await db.query(
    "SELECT public.reserve_redirect_password_logo($1,NULL,$2,$3,'image/png',100,64,64,repeat('a',64)) AS value",
    [actor, root.id, passwordBrand.version],
  )
).rows[0].value;
await db.query('SELECT public.finish_redirect_password_logo($1,NULL,$2,$3)', [
  actor,
  root.id,
  passwordAsset.id,
]);
const brandedChallenge = await open();
assert.equal(brandedChallenge.status, 401);
const brandedHtml = await brandedChallenge.text();
assert.ok(brandedHtml.includes('Community &amp; &lt;root&gt;'));
assert.ok(
  brandedHtml.includes('/storage/v1/object/public/redirect-brand-assets/' + passwordAsset.key),
);
assert.ok(brandedHtml.includes('crossorigin="anonymous" referrerpolicy="no-referrer"'));
assert.doesNotMatch(brandedHtml, /example[.]org/u);
assert.ok(
  brandedChallenge.headers
    .get('Content-Security-Policy')
    .includes('img-src https://fixture.supabase.co'),
);
const brandedHead = await open('/', { method: 'HEAD' });
assert.equal(brandedHead.status, 401);
assert.equal(await brandedHead.text(), '');
assert.equal((await open()).status, 401);
assert.equal((await open('/', { method: 'HEAD' })).status, 401);
assert.equal(await total(), 0);
const wrong = await open('/', { method: 'POST', password: 'wrong' });
assert.equal(wrong.status, 401);
assert.equal(wrong.headers.get('Location'), null);
assert.ok((await wrong.text()).includes('Community &amp; &lt;root&gt;'));
assert.equal(await total(), 0);
const granted = await open('/?qg_qr=1&utm_source=poster', {
  method: 'POST',
  password: 'fixture-root-password',
});
assert.equal(granted.status, 303);
assert.match(granted.headers.get('Location'), /^https:\/\/example.org\/home\?/);
assert.ok(new URL(granted.headers.get('Location')).searchParams.get('qg_click_id'));
assert.equal(await total(), 1);
const event = (
  await db.query('SELECT path,visitor,query FROM public.redirect_events WHERE redirect_id=$1', [
    root.id,
  ])
).rows[0];
assert.equal(event.path, '/');
assert.equal(event.visitor.domain, 'root-http.example.com');
assert.equal(event.visitor.is_qr, true);
assert.equal(event.query, 'utm_source=poster');
await db.query('UPDATE public.redirect_link_policies SET password_hash=NULL WHERE redirect_id=$1', [
  root.id,
]);
const preview = await open('/', { agent: 'Twitterbot/1.0' });
assert.equal(preview.status, 200);
assert.match(
  await preview.text(),
  /property="og:url" content="https:\/\/root-http\.example\.com\/"/,
);
assert.equal(await total(), 1);
assert.equal((await open('/', { method: 'HEAD' })).status, 302);
assert.equal(await total(), 1);
const ios = await open('/', { agent: 'iPhone' });
assert.equal(new URL(ios.headers.get('Location')).pathname, '/ios');
assert.equal(await total(), 2);
assert.equal((await open()).status, 410);
assert.equal(await total(), 2);
await db.query('UPDATE public.redirects SET is_enabled=false WHERE id=$1', [root.id]);
assert.equal((await open()).status, 404);
assert.notEqual((await open()).headers.get('Location'), 'https://example.org/legacy');
await db.query(
  "UPDATE public.redirects SET is_enabled=true,start_at=now()+interval '1 day' WHERE id=$1",
  [root.id],
);
assert.equal((await open()).status, 404);
await db.query(
  "UPDATE public.redirects SET start_at=NULL,end_at=now()-interval '1 day' WHERE id=$1",
  [root.id],
);
assert.equal((await open()).status, 410);
assert.equal(await total(), 2);
assert.equal((await open('/' + root.slug)).status, 404);
await db.query('DELETE FROM public.redirects WHERE id=$1', [root.id]);
assert.equal((await open()).headers.get('Location'), 'https://example.org/legacy');
// Native requests run the same actual policy/visit transaction on both gateways.
const nativeProtocol = sharedModule('redirect-native-resolution');
const nativeLink = (
  await db.query(
    "INSERT INTO public.redirects(type,slug,target,status_code,query_mode) VALUES('SHORT','native-proof','https://example.org/content#section',302,'PRESERVE') RETURNING *",
  )
).rows[0];
await db.query(
  'INSERT INTO public.redirect_link_policies(redirect_id,policy,password_hash) VALUES($1,$2,$3)',
  [
    nativeLink.id,
    JSON.stringify({
      track_conversions: true,
      device_targets: { ios: 'https://example.org/native-ios#section' },
    }),
    JSON.stringify(await policy.hashLinkPassword('native-password')),
  ],
);
async function nativeOpen({
  method = 'GET',
  password,
  consent = false,
  query = '',
  agent = 'QueerGuide SDK iPhone',
  handoffHeaders = {},
  ip = '192.0.2.33',
} = {}) {
  return builtinExports.onRequest({
    request: new Request('https://queer.guide/go/native-proof' + query, {
      method,
      headers: {
        Accept: nativeProtocol.NATIVE_REDIRECT_MEDIA,
        'User-Agent': agent,
        'cf-connecting-ip': ip,
        ...(consent ? { [nativeProtocol.NATIVE_CONSENT_HEADER]: 'granted' } : {}),
        ...handoffHeaders,
        ...(password ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(password ? { body: new URLSearchParams({ password }).toString() } : {}),
    }),
    params: { slug: 'native-proof' },
    env: { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
  });
}
const nativeEvents = async () =>
  (
    await db.query(
      'SELECT count(*)::int AS count FROM public.redirect_events WHERE redirect_id=$1',
      [nativeLink.id],
    )
  ).rows[0].count;
assert.equal((await nativeOpen()).status, 401);
assert.equal(await nativeEvents(), 0);
assert.equal((await nativeOpen({ method: 'HEAD' })).status, 401);
assert.equal((await nativeOpen({ query: '?pw=native-password' })).status, 400);
assert.equal((await nativeOpen({ method: 'POST', password: 'wrong' })).status, 401);
assert.equal(await nativeEvents(), 0);
const anonymousNative = await nativeOpen({
  method: 'POST',
  password: 'native-password',
  query: '?utm_source=native&qg_click_id=forged',
});
assert.equal(anonymousNative.status, 200);
const anonymousOutcome = await anonymousNative.json();
assert.equal(anonymousOutcome.clickId, null);
assert.equal(
  anonymousOutcome.destination,
  'https://example.org/native-ios?utm_source=native#section',
);
assert.equal(await nativeEvents(), 1);
const attributedNative = await nativeOpen({
  method: 'POST',
  password: 'native-password',
  consent: true,
});
assert.equal(attributedNative.status, 200);
const nativeOutcome = await attributedNative.json();
assert.match(nativeOutcome.clickId, /^[a-f0-9-]{36}$/);
assert.equal(
  new URL(nativeOutcome.destination).searchParams.get('qg_click_id'),
  nativeOutcome.clickId,
);
assert.equal(nativeOutcome.mode, 'navigate');
assert.equal(await nativeEvents(), 2);
await db.query('UPDATE public.redirects SET click_limit=2 WHERE id=$1', [nativeLink.id]);
assert.equal((await nativeOpen({ method: 'POST', password: 'native-password' })).status, 410);
await db.query('UPDATE public.redirect_link_policies SET password_hash=NULL WHERE redirect_id=$1', [
  nativeLink.id,
]);
assert.equal((await nativeOpen({ method: 'HEAD' })).status, 410);
assert.equal(await nativeEvents(), 2);
await db.query(
  "UPDATE public.redirects SET click_limit=NULL,end_at=now()-interval '1 minute' WHERE id=$1",
  [nativeLink.id],
);
await db.query(
  'UPDATE public.redirect_link_policies SET policy=policy||\'{"expired_target":"https://example.org/expired"}\' WHERE redirect_id=$1',
  [nativeLink.id],
);
const nativeExpired = await nativeOpen();
assert.equal(nativeExpired.status, 200);
assert.equal((await nativeExpired.json()).mode, 'web');
assert.equal(await nativeEvents(), 2);
await db.query('UPDATE public.redirects SET end_at=NULL,is_enabled=false WHERE id=$1', [
  nativeLink.id,
]);
assert.equal((await nativeOpen()).status, 404);
assert.equal(await nativeEvents(), 2);
// The branded root also traverses the real Worker, signed relay, resolver and SQL.
const nativeRootCreated = await service.rpc('redirect_management_mutate', {
  p_actor_id: actor,
  p_operations: [
    {
      operation: 'create',
      data: { target: 'https://example.org/native-root', domainId: domain.id, isDomainRoot: true },
    },
  ],
});
assert.equal(nativeRootCreated.error, null);
const nativeRootId = nativeRootCreated.data[0].link.id;
const rootNativeTotal = async () =>
  (await db.query('SELECT click_count FROM public.redirects WHERE id=$1', [nativeRootId])).rows[0]
    .click_count;
const beforeRootNative = await rootNativeTotal();
const brandedNative = await worker.fetch(
  new Request('https://root-http.example.com/', {
    headers: { Accept: nativeProtocol.NATIVE_REDIRECT_MEDIA, 'User-Agent': 'iPhone' },
  }),
  { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
);
assert.equal(brandedNative.status, 200);
const brandedOutcome = await brandedNative.json();
assert.equal(brandedOutcome.canonicalUrl, 'https://root-http.example.com/');
assert.equal(brandedOutcome.clickId, null);
assert.equal(await rootNativeTotal(), beforeRootNative + 1);
await db.query(
  "UPDATE public.redirect_domains SET not_found_url='https://example.org/not-found?qg_click_id=forged' WHERE id=$1",
  [domain.id],
);
const nativeFallback = await worker.fetch(
  new Request('https://root-http.example.com/missing-native', {
    headers: { Accept: nativeProtocol.NATIVE_REDIRECT_MEDIA },
  }),
  { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
);
assert.equal(nativeFallback.status, 200);
const fallbackOutcome = await nativeFallback.json();
assert.equal(fallbackOutcome.mode, 'web');
assert.equal(fallbackOutcome.destination, 'https://example.org/not-found');
assert.equal(fallbackOutcome.clickId, null);
assert.equal(await rootNativeTotal(), beforeRootNative + 1);
// A policy/target edit after the snapshot/password check must win over the
// resolver's old in-memory outcome. Exercise the actual gateway/resolver/SQL.
await db.query('UPDATE public.redirects SET is_enabled=true WHERE id=$1', [nativeLink.id]);
const beforeRaceEvents = await nativeEvents();
beforeSnapshotVisit = () =>
  db.query('UPDATE public.redirects SET target=$2 WHERE id=$1', [
    nativeLink.id,
    'https://example.org/new-native-target',
  ]);
const targetRace = await nativeOpen();
assert.equal(targetRace.status, 410);
assert.deepEqual(await targetRace.json(), { protocol: 1, error: 'unavailable' });
assert.equal(await nativeEvents(), beforeRaceEvents);
await db.query('UPDATE public.redirect_link_policies SET password_hash=$2 WHERE redirect_id=$1', [
  nativeLink.id,
  JSON.stringify(await policy.hashLinkPassword('race-old-password')),
]);
const newHash = JSON.stringify(await policy.hashLinkPassword('race-new-password'));
beforeSnapshotVisit = () =>
  db.query('UPDATE public.redirect_link_policies SET password_hash=$2 WHERE redirect_id=$1', [
    nativeLink.id,
    newHash,
  ]);
const passwordRace = await nativeOpen({ method: 'POST', password: 'race-old-password' });
assert.equal(passwordRace.status, 410);
assert.equal(await nativeEvents(), beforeRaceEvents);
const oldPassword = await nativeOpen({ method: 'POST', password: 'race-old-password' });
assert.equal(oldPassword.status, 401);
assert.equal(await nativeEvents(), beforeRaceEvents);
const currentPassword = await nativeOpen({ method: 'POST', password: 'race-new-password' });
assert.equal(currentPassword.status, 200);
assert.equal(new URL((await currentPassword.json()).destination).pathname, '/native-ios');
assert.equal(await nativeEvents(), beforeRaceEvents + 1);
const handoffOpen = (options) => nativeOpen({ ...options, ip: '192.0.2.34' });
const handoffApp = await service.rpc('redirect_native_app_admin', {
  p_actor: actor,
  p_action: 'create',
  p_values: JSON.stringify({
    label: 'Private handoff fixture',
    platform: 'ios',
    appId: 'ABCDE12345.org.example.http',
    enabled: true,
  }),
});
assert.equal(handoffApp.error, null);
const handoffAppId = handoffApp.data.id;
const creationHeaders = {
  [nativeProtocol.NATIVE_HANDOFF_ACTION]: 'create',
  [nativeProtocol.NATIVE_HANDOFF_APP]: handoffAppId,
};
const handoffCount = await nativeEvents();
assert.equal(
  (
    await handoffOpen({
      method: 'POST',
      password: 'race-new-password',
      query: '?qg_handoff=install',
      handoffHeaders: creationHeaders,
    })
  ).status,
  400,
);
assert.equal(
  (
    await handoffOpen({
      method: 'POST',
      password: 'race-new-password',
      consent: true,
      query: '?qg_handoff=install',
      handoffHeaders: creationHeaders,
    })
  ).status,
  410,
);
assert.equal(await nativeEvents(), handoffCount);
await db.query(
  "UPDATE public.redirect_native_apps SET handoff_enabled=true,public_name='Fixture app',store_id='1234567890',app_group_id='group.org.example.handoff',app_clip_id=app_id||'.Clip' WHERE id=$1",
  [handoffAppId],
);
const browserLanding = (query = '?qg_handoff=install') => builtinExports.onRequest({
  request: new Request('https://queer.guide/go/native-proof' + query, {headers: {Accept: 'text/html'}}),
  params: {slug: 'native-proof'}, env: {SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'fixture-public', REDIRECT_RELAY_SECRET: secret},
});
const browserBefore = await nativeEvents();
const installLanding = await browserLanding('?qg_handoff=install&qg_app_choice=' + handoffAppId + '&utm_source=poster');
assert.equal(installLanding.status, 200); assert.equal(installLanding.headers.get('Location'), null);
const installHtml = await installLanding.text();
assert.ok(installHtml.includes('name="apple-itunes-app"'));
assert.ok(installHtml.includes('Fixture app')); assert.ok(installHtml.includes('name="password"'));
assert.ok(!installHtml.includes('race-new-password') && !installHtml.includes('group.org.example.handoff'));
assert.ok(installLanding.headers.get('Content-Security-Policy').includes("connect-src 'self'"));
assert.equal(await nativeEvents(), browserBefore);
const tokenQueryLanding = await browserLanding('?qg_handoff=resume&qg_handoff_token=' + 'qg_handoff_' + 'a'.repeat(64));
assert.equal(tokenQueryLanding.status, 400); assert.equal(await nativeEvents(), browserBefore);
// Use an active real experiment: resume must restore the original cohort rather
// than randomly rerolling it, even with its original quota already exhausted.
await db.query('UPDATE public.redirect_link_policies SET policy=$2 WHERE redirect_id=$1', [
  nativeLink.id,
  JSON.stringify({
    track_conversions: true,
    experiment: {
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      variants: [
        { id: 'a', url: 'https://example.org/cohort-a', weight: 50 },
        { id: 'b', url: 'https://example.org/cohort-b', weight: 50 },
      ],
    },
  }),
]);
await db.query('UPDATE public.redirects SET click_limit=click_count+1 WHERE id=$1', [
  nativeLink.id,
]);
const createdHandoff = await handoffOpen({
  method: 'POST',
  password: 'race-new-password',
  consent: true,
  query: '?qg_handoff=install&utm_source=installation',
  handoffHeaders: creationHeaders,
});
assert.equal(createdHandoff.status, 200);
const handoffOutcome = await createdHandoff.json(),
  rawReceipt = createdHandoff.headers.get(nativeProtocol.NATIVE_HANDOFF_TOKEN);
assert.match(rawReceipt, /^qg_handoff_[a-f0-9]{64}$/);
assert.equal(createdHandoff.headers.get(nativeProtocol.NATIVE_HANDOFF_STATE), 'created');
assert.ok(
  Date.parse(createdHandoff.headers.get(nativeProtocol.NATIVE_HANDOFF_EXPIRY)) > Date.now(),
);
assert.equal(await nativeEvents(), handoffCount + 1);
// A resume page must remain available at its already-reserved visit cap.
const resumeLanding = await browserLanding('?qg_handoff=resume');
assert.equal(resumeLanding.status, 200); assert.equal(resumeLanding.headers.get('Location'), null);
assert.ok((await resumeLanding.text()).includes('Continue with your link'));
assert.equal(await nativeEvents(), handoffCount + 1);
const storedReceipt = (
  await db.query('SELECT * FROM public.redirect_native_handoff_receipts WHERE click_id=$1', [
    handoffOutcome.clickId,
  ])
).rows[0];
assert.equal(storedReceipt.token_hash, await nativeProtocol.nativeHandoffDigest(rawReceipt));
assert.notEqual(storedReceipt.token_hash, rawReceipt);
assert.ok(
  !(
    await db.query(
      'SELECT to_jsonb(r)::text AS value FROM public.redirect_native_handoff_receipts r',
    )
  ).rows.some((row) => row.value.includes(rawReceipt)),
);
const resumeHeaders = {
  [nativeProtocol.NATIVE_HANDOFF_ACTION]: 'resume',
  [nativeProtocol.NATIVE_HANDOFF_APP]: handoffAppId,
  [nativeProtocol.NATIVE_HANDOFF_TOKEN]: rawReceipt,
};
assert.equal((await handoffOpen({ query: '?qg_handoff=resume', consent: true })).status, 400);
assert.equal(
  (
    await handoffOpen({
      query: '?qg_handoff=resume',
      consent: false,
      handoffHeaders: resumeHeaders,
    })
  ).status,
  400,
);
assert.equal(
  (
    await handoffOpen({
      query: '?qg_handoff=resume&utm_source=forged',
      consent: true,
      handoffHeaders: resumeHeaders,
    })
  ).status,
  400,
);
assert.equal(
  (
    await handoffOpen({
      method: 'POST',
      password: 'race-old-password',
      query: '?qg_handoff=resume',
      consent: true,
      handoffHeaders: resumeHeaders,
    })
  ).status,
  401,
);
assert.equal(await nativeEvents(), handoffCount + 1);
const resumedHandoff = await handoffOpen({
  method: 'POST',
  password: 'race-new-password',
  query: '?qg_handoff=resume',
  consent: true,
  handoffHeaders: resumeHeaders,
});
assert.equal(resumedHandoff.status, 200);
const resumedOutcome = await resumedHandoff.json();
assert.equal(resumedOutcome.clickId, handoffOutcome.clickId);
assert.equal(resumedOutcome.destination, handoffOutcome.destination);
assert.equal(new URL(resumedOutcome.destination).searchParams.get('utm_source'), 'installation');
assert.ok(!resumedOutcome.destination.includes('qg_handoff'));
assert.equal(resumedHandoff.headers.get(nativeProtocol.NATIVE_HANDOFF_STATE), 'consumed');
assert.equal(resumedHandoff.headers.get(nativeProtocol.NATIVE_HANDOFF_TOKEN), null);
assert.equal(await nativeEvents(), handoffCount + 1);
assert.equal(
  (
    await handoffOpen({
      method: 'POST',
      password: 'race-new-password',
      query: '?qg_handoff=resume',
      consent: true,
      handoffHeaders: resumeHeaders,
    })
  ).status,
  404,
);
assert.equal(await nativeEvents(), handoffCount + 1);
// Prove the same header protocol through the actual signed branded-root Worker.
const brandedApp = await service.rpc('redirect_native_app_admin', {
  p_actor: actor,
  p_action: 'create',
  p_values: JSON.stringify({
    label: 'Private branded fixture',
    domainId: domain.id,
    platform: 'ios',
    appId: 'ABCDE12345.org.example.brand',
    paths: ['/'],
    enabled: true,
  }),
});
assert.equal(brandedApp.error, null);
await db.query(
  "UPDATE public.redirect_native_apps SET handoff_enabled=true,public_name='Fixture app',store_id='1234567890',app_group_id='group.org.example.handoff',app_clip_id=app_id||'.Clip' WHERE id=$1",
  [brandedApp.data.id],
);
await db.query(
  'INSERT INTO public.redirect_link_policies(redirect_id,policy) VALUES($1,$2) ON CONFLICT(redirect_id) DO UPDATE SET policy=excluded.policy',
  [nativeRootId, JSON.stringify({ track_conversions: true })],
);
const brandedOpen = (action, token) =>
  worker.fetch(
    new Request(
      'https://root-http.example.com/?qg_handoff=' + (action === 'create' ? 'install' : 'resume'),
      {
        headers: {
          Accept: nativeProtocol.NATIVE_REDIRECT_MEDIA,
          'x-qg-attribution-consent': 'granted',
          [nativeProtocol.NATIVE_HANDOFF_ACTION]: action,
          [nativeProtocol.NATIVE_HANDOFF_APP]: brandedApp.data.id,
          ...(token ? { [nativeProtocol.NATIVE_HANDOFF_TOKEN]: token } : {}),
        },
      },
    ),
    { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
  );
const beforeBrandedLanding = await rootNativeTotal();
const brandedLanding = await worker.fetch(new Request('https://root-http.example.com/?qg_handoff=install&qg_app_choice=' + brandedApp.data.id, {headers: {Accept: 'text/html'}}), {...values,SUPABASE_ANON_KEY:'fixture-public'});
assert.equal(brandedLanding.status, 200); assert.equal(brandedLanding.headers.get('Location'), null);
assert.ok((await brandedLanding.text()).includes('name="apple-itunes-app"'));
assert.equal(await rootNativeTotal(), beforeBrandedLanding);
const missingBranded = await worker.fetch(new Request('https://root-http.example.com/missing-link?qg_handoff=resume', {headers: {Accept:'text/html'}}), {...values,SUPABASE_ANON_KEY:'fixture-public'});
assert.equal(missingBranded.status,404); assert.equal(missingBranded.headers.get('Location'),null);
const beforeBranded = await rootNativeTotal();
const brandedReceipt = await brandedOpen('create');
assert.equal(brandedReceipt.status, 200);
const brandedCreated = await brandedReceipt.json();
const archivedDomainBefore = await service.rpc('redirect_domain_resource', {p_action:'get',p_actor:actor,p_id:domain.id});
assert.equal(archivedDomainBefore.error,null);
const archivedDomain = await service.rpc('redirect_domain_resource', {p_action:'patch',p_actor:actor,p_id:domain.id,p_values:JSON.stringify({version:archivedDomainBefore.data.version,archived:true})});
assert.equal(archivedDomain.error,null);assert.equal(archivedDomain.data.archived,true);assert.equal(archivedDomain.data.routingReady,true);
const archivedHead = await worker.fetch(new Request('https://root-http.example.com/',{method:'HEAD'}),{...values,SUPABASE_ANON_KEY:'fixture-public'});
assert.ok([301,302,303,307,308].includes(archivedHead.status));assert.equal(archivedHead.headers.get('Location'),'https://example.org/native-root');assert.equal(await archivedHead.text(),'');
assert.equal(await rootNativeTotal(),beforeBranded+1);

const brandedResumed = await brandedOpen(
  'resume',
  brandedReceipt.headers.get(nativeProtocol.NATIVE_HANDOFF_TOKEN),
);
assert.equal(brandedResumed.status, 200);
const brandedResumedBody = await brandedResumed.json();
assert.equal(brandedResumedBody.clickId, brandedCreated.clickId);
assert.equal(brandedResumedBody.canonicalUrl, 'https://root-http.example.com/');
assert.equal(await rootNativeTotal(), beforeBranded + 1);
const restoredDomain = await service.rpc('redirect_domain_resource', {p_action:'patch',p_actor:actor,p_id:domain.id,p_values:JSON.stringify({version:archivedDomain.data.version,archived:false})});
assert.equal(restoredDomain.error,null);assert.equal(restoredDomain.data.archived,false);
console.log('Domain archival: actual signed branded Worker HEAD and outstanding native receipt resume keep routing/current click identity without recounting while the domain is archived.');
// Follow the exact generated subpath adapter through the actual signed gateway.
const subpathRuntime = await subpathFixture('https://website.example.com', '/r', 'root-http.example.com', () => { throw new Error('Subpath gateway contract attempted an external request'); });
try {
  const beforeSubpathRoot = await rootNativeTotal();
  const publicEntry = await subpathRuntime.runtime.dispatchFetch('https://website.example.com/r/?qg_handoff=install&utm_source=website&qg_app_choice=' + brandedApp.data.id, { redirect: 'manual' });
  assert.equal(publicEntry.status, 307);
  const installEntry = await worker.fetch(new Request(publicEntry.headers.get('Location'), { headers: { Accept: 'text/html' } }), { ...values, SUPABASE_ANON_KEY: 'fixture-public' });
  assert.equal(installEntry.status, 200);
  assert.match(await installEntry.text(), /name="apple-itunes-app"/);
  assert.equal(await rootNativeTotal(), beforeSubpathRoot);
  const subpathCreated = await service.rpc('redirect_management_mutate', { p_operations: [{ operation: 'create', data: { domainId: domain.id, slug: 'subpath-proof', target: 'https://example.org/subpath-final?fixed=target-a&fixed=target-b', queryMode: 'PRESERVE' } }], p_actor_id: actor });
  assert.equal(subpathCreated.error, null);
  const subpathLink = subpathCreated.data[0].link;
  await db.query('INSERT INTO public.redirect_link_policies(redirect_id,policy,password_hash) VALUES($1,$2,$3)', [subpathLink.id, JSON.stringify({ track_conversions: true }), JSON.stringify(await policy.hashLinkPassword('subpath-fixture-passphrase'))]);
  const subpathEntry = await subpathRuntime.runtime.dispatchFetch('https://website.example.com/r/subpath-proof?utm_source=website&qg_qr=1&tag=one&tag=two&fixed=visitor-a&fixed=visitor-b', { redirect: 'manual' });
  assert.equal(subpathEntry.status, 307);
  const forward = (method = 'GET', body) => worker.fetch(new Request(subpathEntry.headers.get('Location'), { method, headers: { 'cf-connecting-ip': '192.0.2.25', 'User-Agent': 'Fixture browser', Referer: 'https://website.example.com/', Accept: 'text/html', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, ...(body ? { body } : {}) }), { ...values, SUPABASE_ANON_KEY: 'fixture-public' });
  const protectedEntry = await forward();
  assert.equal(protectedEntry.status, 401);
  assert.match(await protectedEntry.text(), /type="password"/);
  const protectedHead = await forward('HEAD');
  assert.equal(protectedHead.status, 401); assert.equal(await protectedHead.text(), '');
  assert.equal((await db.query('SELECT click_count FROM public.redirects WHERE id=$1', [subpathLink.id])).rows[0].click_count, 0);
  const passwordEntry = await forward('POST', new URLSearchParams({ password: 'subpath-fixture-passphrase' }).toString());
  assert.equal(passwordEntry.status, 303);
  const finalEntry = new URL(passwordEntry.headers.get('Location'));
  assert.equal(finalEntry.origin + finalEntry.pathname, 'https://example.org/subpath-final');
  assert.equal(finalEntry.searchParams.get('utm_source'), 'website');
  assert.deepEqual(finalEntry.searchParams.getAll('tag'), ['one', 'two']);
  assert.deepEqual(finalEntry.searchParams.getAll('fixed'), ['target-a', 'target-b']);
  assert.match(finalEntry.searchParams.get('qg_click_id'), /^[a-f0-9-]{36}$/i);
  const subpathEvent = (await db.query('SELECT path,visitor,query,referer FROM public.redirect_events WHERE redirect_id=$1', [subpathLink.id])).rows;
  assert.equal(subpathEvent.length, 1); assert.equal(subpathEvent[0].path, '/subpath-proof');
  assert.equal(subpathEvent[0].referer, 'https://website.example.com/');
  assert.equal(subpathEvent[0].visitor.domain, 'root-http.example.com'); assert.equal(subpathEvent[0].visitor.is_qr, true);
  assert.equal(subpathEvent[0].query, 'utm_source=website&tag=one&tag=two&fixed=visitor-a&fixed=visitor-b');
  assert.equal(await rootNativeTotal(), beforeSubpathRoot);
  await db.query("UPDATE public.redirects SET query_mode='OVERRIDE',query_override='{}'::jsonb||jsonb_build_object('tag','forced','extra','from-override'),utm_defaults=jsonb_build_object('utm_campaign','default','tag','not-used') WHERE id=$1", [subpathLink.id]);
  const overriddenEntry = new URL((await forward('POST', new URLSearchParams({ password: 'subpath-fixture-passphrase' }).toString())).headers.get('Location'));
  assert.deepEqual(overriddenEntry.searchParams.getAll('tag'), ['forced']);
  assert.deepEqual(overriddenEntry.searchParams.getAll('fixed'), ['target-a', 'target-b']);
  assert.equal(overriddenEntry.searchParams.get('utm_source'), 'website');
  assert.equal(overriddenEntry.searchParams.get('utm_campaign'), 'default');
  await db.query("UPDATE public.redirects SET query_mode='DROP' WHERE id=$1", [subpathLink.id]);
  const droppedEntry = new URL((await forward('POST', new URLSearchParams({ password: 'subpath-fixture-passphrase' }).toString())).headers.get('Location'));
  assert.deepEqual(droppedEntry.searchParams.getAll('fixed'), ['target-a', 'target-b']);
  assert.equal(droppedEntry.searchParams.has('tag'), false); assert.equal(droppedEntry.searchParams.has('utm_source'), false); assert.equal(droppedEntry.searchParams.has('utm_campaign'), false);
  console.log('Website subpath: actual generated workerd adapter -> signed branded Worker -> resolver -> migrated SQL preserves install-page/no-count behavior, password GET/HEAD protection, exact campaigns/duplicate query/QR attribution and one original click after the branded password POST.');
} finally { await subpathRuntime.runtime.dispose(); }
// The shared IP budget applies before disclosure/consumption, without weakening
// the independent password throttle. Saturate only this isolated DB fixture.
await db.query(
  "UPDATE public.redirect_report_budgets SET attempts=30 WHERE bucket LIKE 'native-handoff:%'",
);
const throttledHandoff = await handoffOpen({
  method: 'POST',
  password: 'race-new-password',
  query: '?qg_handoff=install',
  consent: true,
  handoffHeaders: creationHeaders,
});
assert.equal(throttledHandoff.status, 429);
assert.match(throttledHandoff.headers.get('retry-after'), /^[1-9][0-9]*$/);
assert.equal(await nativeEvents(), handoffCount + 1);
console.log(
  'Native handoff: actual Pages and signed branded Worker/resolver/SQL create, digest-only storage, current password, marker downgrade/consent denial, original query/cohort/quota reservation and single-use redemption pass.',
);
console.log(
  'Resolution snapshots: actual gateway/resolver/SQL reject mid-flight target and password changes without counting a visit; only the current password succeeds.',
);
console.log(
  'Native resolution: actual built-in Pages and signed branded Worker -> resolver -> PostgreSQL verify password/challenge/POST, query-secret rejection, denied/granted attribution, iOS targeting, root identity, atomic quota, HEAD, expiry fallback and disabled links.',
);
console.log(
  'Managed roots: actual Worker → signed resolver → migrated PostgreSQL verifies legacy fallback only when absent, password POST/HEAD denial, targeting, root preview canonical URL, QR/conversion attribution, atomic quota, scheduling/expiry/disabled behavior and inaccessible internal slug. No external requests.',
);

const { verifyPublicWorkspaceRouting } = await import('./lib/redirect-public-workspace-fixture.mjs');
await verifyPublicWorkspaceRouting({
  db,
  builtin: builtinExports,
  worker,
  values,
  hashPassword: policy.hashLinkPassword,
});
await db.close();
