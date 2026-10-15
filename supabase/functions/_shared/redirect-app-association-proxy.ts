import {
  APP_ASSOCIATION_PATHS,
  associationDocument,
  type NativeAppBinding,
} from './redirect-native-apps.ts';
export interface AppAssociationEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}
/** Fixed upstream only; never follows a redirect or proxies arbitrary response bytes. */
export async function proxyAppAssociation(
  request: Request,
  env: AppAssociationEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  const url = new URL(request.url),
    platform = APP_ASSOCIATION_PATHS[url.pathname as keyof typeof APP_ASSOCIATION_PATHS];
  if (!platform) return null;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  };
  const reply = (body: unknown, status = 200) =>
    new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers });
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search)
    return reply({ error: 'Invalid association request' }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    return reply({ error: 'Associations temporarily unavailable' }, 503);
  try {
    const upstream = new URL('/functions/v1/redirect-api/public-app-association', env.SUPABASE_URL);
    if (
      upstream.protocol !== 'https:' ||
      upstream.port ||
      upstream.username ||
      upstream.password ||
      !upstream.hostname.endsWith('.supabase.co')
    )
      throw new Error('Invalid upstream');
    upstream.searchParams.set('hostname', url.hostname);
    upstream.searchParams.set('platform', platform);
    const response = await fetcher(upstream, {
      headers: { Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY, apikey: env.SUPABASE_ANON_KEY },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return reply(
        {
          error:
            response.status === 404 ? 'Host unavailable' : 'Associations temporarily unavailable',
        },
        response.status === 404 ? 404 : 503,
      );
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      await response.body?.cancel();
      throw new Error('Invalid response type');
    }
    if (Number(response.headers.get('content-length') ?? 0) > 65536) {
      await response.body?.cancel();
      throw new Error('Oversized response');
    }
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65536) {
        await reader.cancel();
        throw new Error('Oversized response');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // Reconstruct the exact owned schema. Unknown fields/permissions/exclusions fail closed.
    const records: NativeAppBinding[] =
      platform === 'ios'
        ? raw.applinks.details.map((item: { appIDs: string[]; components: { '/': string }[] }) => ({
            platform: 'ios',
            appId: item.appIDs.length === 1 ? item.appIDs[0] : '',
            fingerprints: [],
            paths: item.components.map((rule) => rule['/']),
          }))
        : raw.map(
            (item: {
              target: { package_name: string; sha256_cert_fingerprints: string[] };
              relation_extensions: Record<
                string,
                { dynamic_app_link_components: { '/': string }[] }
              >;
            }) => ({
              platform: 'android',
              appId: item.target.package_name,
              fingerprints: item.target.sha256_cert_fingerprints,
              paths: item.relation_extensions[
                'delegate_permission/common.handle_all_urls'
              ].dynamic_app_link_components
                .slice(0, -1)
                .map((rule) => rule['/']),
            }),
          );
    const result = associationDocument(
      platform,
      records,
      url.hostname,
      platform === 'ios' ? raw.appclips?.apps : undefined,
    );
    if (JSON.stringify(result) !== JSON.stringify(raw))
      throw new Error('Unexpected association schema');
    return reply(result);
  } catch {
    return reply({ error: 'Associations temporarily unavailable' }, 503);
  }
}
