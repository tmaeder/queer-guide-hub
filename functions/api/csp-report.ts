/**
 * POST /api/csp-report — relays CSP violation reports to Sentry's security
 * endpoint. Target of both `report-uri` (legacy `application/csp-report`) and
 * `report-to` (`application/reports+json`) in the CSP; see
 * `_lib/securityHeaders.ts` and `public/_headers`.
 *
 * Same-origin rather than pointing the CSP straight at Sentry because
 * `public/_headers` is static and cannot read the DSN, which lives only in the
 * Pages env (`VITE_SENTRY_DSN`, a secret). No DSN → reports are accepted and
 * dropped, so the browser never retries.
 */

interface Env {
  VITE_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
}

const MAX_BODY_BYTES = 64 * 1024;

/** `https://KEY@HOST/PROJECT` → `https://HOST/api/PROJECT/security/?sentry_key=KEY`, or null. */
export function sentrySecurityEndpoint(dsn: string | undefined): string | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  const project = url.pathname.replace(/^\/+|\/+$/g, '');
  if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(project)) return null;
  return `https://${url.host}/api/${project}/security/?sentry_key=${encodeURIComponent(url.username)}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const endpoint = sentrySecurityEndpoint(env.VITE_SENTRY_DSN ?? env.SENTRY_DSN);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (endpoint && declared <= MAX_BODY_BYTES) {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0 && body.byteLength <= MAX_BODY_BYTES) {
      waitUntil(
        fetch(endpoint, {
          method: 'POST',
          body,
          headers: {
            'content-type': request.headers.get('content-type') ?? 'application/csp-report',
            'user-agent': request.headers.get('user-agent') ?? '',
          },
        }).catch(() => undefined),
      );
    }
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
