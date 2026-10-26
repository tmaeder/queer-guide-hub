import routes from './appRoutes.json';

/** RFC 9110: the most specific matching range determines quality. Prefer
 * HTML on a tie so wildcard browser requests retain the normal UI. */
export function preferredContent(accept: string | null): 'html' | 'markdown' | null {
  if (!accept?.trim()) return 'html';
  const ranges = accept
    .toLowerCase()
    .split(',')
    .map((part) => {
      const [type, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { type, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
    });
  const quality = (type: string) => {
    for (const pattern of [type, 'text/*', '*/*']) {
      const match = ranges.filter((r) => r.type === pattern);
      if (match.length) return Math.max(...match.map((r) => r.q));
    }
    return 0;
  };
  const html = quality('text/html');
  const markdown = quality('text/markdown');
  return html === 0 && markdown === 0 ? null : markdown > html ? 'markdown' : 'html';
}

const compilePatterns = (paths: string[]) =>
  paths.map(
    (path) =>
      new RegExp(
        '^' +
          path
            .split('/')
            .map((segment) => {
              if (segment === '*') return '.*';
              if (segment.startsWith(':')) return segment.endsWith('?') ? '[^/]*' : '[^/]+';
              return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('/') +
          '/?$',
      ),
  );

const patterns = compilePatterns(routes.paths);
const endpointPatterns = compilePatterns(routes.functionPaths);
export const isEdgeEndpoint = (path: string): boolean =>
  endpointPatterns.some((pattern) => pattern.test(path));

export function isKnownAppPath(path: string): boolean {
  // Public handle URLs are resolved by HandleOrNotFound in the SPA.
  return /^\/@[a-zA-Z0-9_.]{3,20}\/?$/.test(path) || patterns.some((pattern) => pattern.test(path));
}

export function appRedirect(path: string, locale: string, search: string): string | null {
  const redirect = routes.redirects[path.replace(/\/+$/, '') as keyof typeof routes.redirects];
  if (!redirect) return null;
  const prefix = redirect.localized && locale !== 'en' ? '/' + locale : '';
  return (
    prefix + redirect.to + (redirect.preserveQuery && !redirect.to.includes('?') ? search : '')
  );
}

export function markdownResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function markdownNotFound(): Response {
  return markdownResponse(
    '# 404 — Page not found\n\nThis Queer Guide resource does not exist or has been removed. Find available resources in [API documentation](https://queer.guide/docs), [llms.txt](https://queer.guide/llms.txt), or the [sitemap](https://queer.guide/sitemap.xml).\n',
    404,
  );
}

export function apiError(status: number, code: string, message: string, hint: string): Response {
  return Response.json(
    { error: { code, message, hint }, docs: 'https://queer.guide/docs' },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
