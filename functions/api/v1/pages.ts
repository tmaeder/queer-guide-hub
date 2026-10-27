import { PUBLIC_PAGES, pageRecord } from '../../_lib/agentContent';
import { apiError } from '../../_lib/agentHttp';

export function publicPages(request: Request): Response {
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    });
  if (!['GET', 'HEAD'].includes(request.method)) {
    const response = apiError(
      405,
      'METHOD_NOT_ALLOWED',
      'This API is read-only.',
      'Use GET or HEAD. See /docs.',
    );
    response.headers.set('Allow', 'GET, HEAD, OPTIONS');
    return response;
  }
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') ?? '';
  if (
    [...url.searchParams.keys()].some((key) => key !== 'prefix') ||
    url.searchParams.getAll('prefix').length > 1 ||
    Array.from(prefix).length > 128 ||
    (url.pathname.replace(/\/$/, '') !== '/api/v1/pages' && url.search)
  )
    return apiError(
      400,
      'INVALID_PARAMETERS',
      'Only a single prefix filter of at most 128 characters is supported on the page list.',
      'Use /api/v1/pages?prefix=travel; individual page requests do not accept query parameters.',
    );
  let slug: string;
  try {
    slug = decodeURIComponent(url.pathname.replace(/^\/api\/v1\/pages\/?/, '').replace(/\/$/, ''));
  } catch {
    return apiError(
      400,
      'INVALID_PATH',
      'Invalid URL encoding.',
      'Use a slug returned by GET /api/v1/pages.',
    );
  }
  const body = slug
    ? pageRecord(slug)
    : {
        pages: Object.keys(PUBLIC_PAGES)
          .filter((key) => key.startsWith(prefix))
          .map((key) => {
            const page = pageRecord(key)!;
            return { slug: key, title: page.title, url: page.url };
          }),
      };
  if (!body)
    return apiError(
      404,
      'PAGE_NOT_FOUND',
      'This public page does not exist.',
      'Discover available slugs with GET /api/v1/pages.',
    );
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const onRequest: PagesFunction = ({ request }) => publicPages(request);
