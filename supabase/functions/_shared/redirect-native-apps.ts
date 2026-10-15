import { UUID } from './redirect-api.ts';
export interface NativeAppBinding {
  platform: 'ios' | 'android';
  appId: string;
  appClipId?: string;
  fingerprints: string[];
  paths: string[];
}
export const APP_ASSOCIATION_PATHS = {
  '/.well-known/apple-app-site-association': 'ios',
  '/apple-app-site-association': 'ios',
  '/.well-known/assetlinks.json': 'android',
} as const;
export function nativeAppValues(input: unknown, creating = false): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Provide app settings');
  const value = input as Record<string, unknown>;
  if (
    !Object.keys(value).length ||
    Object.keys(value).some(
      (k) =>
        ![
          'label',
          'domainId',
          'platform',
          'appId',
          'appClipId',
          'fingerprints',
          'paths',
          'enabled',
          'publicName',
          'storeId',
          'appGroupId',
          'handoffEnabled',
        ].includes(k),
    )
  )
    throw new Error('Invalid app fields');
  if (
    (creating || value.label !== undefined) &&
    (typeof value.label !== 'string' || !value.label.trim() || value.label.trim().length > 100)
  )
    throw new Error('App label must be 1–100 characters');
  if (
    value.domainId !== undefined &&
    value.domainId !== null &&
    (typeof value.domainId !== 'string' || !UUID.test(value.domainId))
  )
    throw new Error('Invalid app domain');
  if (
    (creating || value.platform !== undefined) &&
    !['ios', 'android'].includes(String(value.platform))
  )
    throw new Error('Choose iOS or Android');
  if (
    (creating || value.appId !== undefined) &&
    (typeof value.appId !== 'string' ||
      value.appId.length > 255 ||
      !/^[A-Za-z0-9_.-]+$/.test(value.appId))
  )
    throw new Error('Invalid app identifier');
  const appClipId =
    typeof value.appClipId === 'string' ? value.appClipId.trim() || null : value.appClipId;
  if (
    appClipId !== undefined &&
    appClipId !== null &&
    (typeof appClipId !== 'string' ||
      appClipId.length > 255 ||
      !/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(appClipId))
  )
    throw new Error('Provide the signed App Clip application identifier');
  for (const [field, maximum] of [
    ['publicName', 100],
    ['storeId', 255],
    ['appGroupId', 255],
  ] as const) {
    if (value[field] === undefined || value[field] === null) continue;
    if (typeof value[field] !== 'string') throw new Error('Invalid install settings');
    const normalized = (value[field] as string).trim() || null;
    if (
      normalized &&
      (normalized.length > maximum ||
        Array.from(normalized).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ))
    )
      throw new Error('Invalid install settings');
    value[field] = normalized;
  }
  if (value.handoffEnabled !== undefined && typeof value.handoffEnabled !== 'boolean')
    throw new Error('Invalid handoff state');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean')
    throw new Error('Invalid app publication state');
  if (value.fingerprints !== undefined) {
    if (
      !Array.isArray(value.fingerprints) ||
      value.fingerprints.length > 10 ||
      value.fingerprints.some(
        (f) =>
          typeof f !== 'string' || !/^(?:[a-f0-9]{64}|(?:[a-f0-9]{2}:){31}[a-f0-9]{2})$/i.test(f),
      )
    )
      throw new Error('Provide SHA-256 signing fingerprints');
    value.fingerprints = [
      ...new Set(
        value.fingerprints.map((f) =>
          String(f).replace(/:/g, '').toUpperCase().match(/../g)!.join(':'),
        ),
      ),
    ];
  }
  if (
    value.paths !== undefined &&
    (!Array.isArray(value.paths) ||
      value.paths.length < 1 ||
      value.paths.length > 20 ||
      value.paths.some(
        (p) =>
          typeof p !== 'string' ||
          p.length > 256 ||
          !/^\/(?:[A-Za-z0-9-]+\/)*[A-Za-z0-9-]*(?:\*)?$/.test(p),
      ))
  )
    throw new Error('Use 1–20 absolute short-link path patterns');
  return {
    ...value,
    ...(typeof value.label === 'string' ? { label: value.label.trim() } : {}),
    ...(appClipId !== undefined ? { appClipId } : {}),
  };
}
export function associationDocument(
  platform: 'ios' | 'android',
  records: NativeAppBinding[],
  hostname?: string,
  publishedClips?: unknown,
) {
  if (!Array.isArray(records) || records.length > 10) throw new Error('Invalid app bindings');
  for (const record of records) {
    nativeAppValues({ label: 'App', ...record }, true);
    if (
      record.platform === 'ios'
        ? !/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(record.appId) ||
          record.fingerprints.length !== 0
        : record.platform !== 'android' ||
          !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(record.appId) ||
          record.fingerprints.length < 1
    )
      throw new Error('Invalid platform app identity');
    if (
      record.appClipId !== undefined &&
      (record.platform !== 'ios' ||
        typeof record.appClipId !== 'string' ||
        !record.appClipId.startsWith(record.appId + '.'))
    )
      throw new Error('Invalid App Clip parent identity');
  }
  if (
    hostname &&
    ['queer.guide', 'www.queer.guide'].includes(hostname) &&
    records.some((record) => record.paths.some((path) => !path.startsWith('/go/')))
  )
    throw new Error('Built-in associations must stay under /go/');
  const selected = records.filter((record) => record.platform === platform);
  const clips =
    publishedClips === undefined
      ? selected.flatMap((record) => (record.appClipId ? [record.appClipId] : []))
      : publishedClips;
  if (
    !Array.isArray(clips) ||
    clips.length > 10 ||
    new Set(clips).size !== clips.length ||
    clips.some(
      (clip) =>
        typeof clip !== 'string' ||
        clip.length > 255 ||
        !/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(clip) ||
        !selected.some(
          (record) => record.platform === 'ios' && clip.startsWith(record.appId + '.'),
        ),
    ) ||
    (platform !== 'ios' && clips.length)
  )
    throw new Error('Invalid published App Clip identities');
  return platform === 'ios'
    ? {
        applinks: {
          details: selected.map((record) => ({
            appIDs: [record.appId],
            components: record.paths.map((path) => ({ '/': path })),
          })),
        },
        ...(clips.length ? { appclips: { apps: clips } } : {}),
      }
    : selected.map((record) => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: record.appId,
          sha256_cert_fingerprints: record.fingerprints,
        },
        relation_extensions: {
          'delegate_permission/common.handle_all_urls': {
            dynamic_app_link_components: [
              ...record.paths.map((path) => ({ '/': path })),
              { '/': '*', exclude: true },
            ],
          },
        },
      }));
}
export async function publicAppAssociation(
  request: Request,
  db: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  },
) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*',
  };
  const reply = (value: unknown, status = 200) =>
    new Response(request.method === 'HEAD' ? null : JSON.stringify(value), { status, headers });
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  const query = new URL(request.url).searchParams,
    hostname = query.get('hostname'),
    platform = query.get('platform');
  if (
    [...query.keys()].some((k) => !['hostname', 'platform'].includes(k)) ||
    query.getAll('hostname').length !== 1 ||
    query.getAll('platform').length !== 1 ||
    !hostname ||
    hostname.length > 239 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname) ||
    !['ios', 'android'].includes(platform ?? '')
  )
    return reply({ error: 'Invalid association request' }, 400);
  try {
    const { data, error } = await db.rpc('redirect_native_apps_public', { p_hostname: hostname });
    if (error) return reply({ error: 'Associations temporarily unavailable' }, 503);
    if (data === null) return reply({ error: 'Host unavailable' }, 404);
    const result = associationDocument(
      platform as 'ios' | 'android',
      data as NativeAppBinding[],
      hostname,
    );
    if (new TextEncoder().encode(JSON.stringify(result)).length > 65536)
      throw new Error('Association document too large');
    return reply(result);
  } catch {
    return reply({ error: 'Associations temporarily unavailable' }, 503);
  }
}
