import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';
const db = await createRedirectTestDb();
await db.exec('SET ROLE service_role');
const secret = 'fixture-root-secret-'.repeat(3);
let handle;
const source = [
  '_shared/link-policy.ts',
  '_shared/redirect-native-resolution.ts',
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
} = {}) {
  return builtinExports.onRequest({
    request: new Request('https://queer.guide/go/native-proof' + query, {
      method,
      headers: {
        Accept: nativeProtocol.NATIVE_REDIRECT_MEDIA,
        'User-Agent': agent,
        'cf-connecting-ip': '192.0.2.33',
        ...(consent ? { [nativeProtocol.NATIVE_CONSENT_HEADER]: 'granted' } : {}),
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
console.log(
  'Resolution snapshots: actual gateway/resolver/SQL reject mid-flight target and password changes without counting a visit; only the current password succeeds.',
);
console.log(
  'Native resolution: actual built-in Pages and signed branded Worker -> resolver -> PostgreSQL verify password/challenge/POST, query-secret rejection, denied/granted attribution, iOS targeting, root identity, atomic quota, HEAD, expiry fallback and disabled links.',
);
console.log(
  'Managed roots: actual Worker → signed resolver → migrated PostgreSQL verifies legacy fallback only when absent, password POST/HEAD denial, targeting, root preview canonical URL, QR/conversion attribution, atomic quota, scheduling/expiry/disabled behavior and inaccessible internal slug. No external requests.',
);

await db.close();
