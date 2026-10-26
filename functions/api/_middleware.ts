import { apiError } from '../_lib/agentHttp';

// Preserve existing API payloads; convert accidental SPA/HTML fallbacks and
// unhandled failures to machine-readable errors without exposing internals.
export const onRequest: PagesFunction = async ({ next }) => {
  try {
    const response = await next();
    if (response.headers.get('Content-Type')?.includes('text/html')) {
      return apiError(
        404,
        'ENDPOINT_NOT_FOUND',
        'This API endpoint does not exist.',
        'See /docs for public endpoints.',
      );
    }
    return response;
  } catch {
    return apiError(
      500,
      'INTERNAL_ERROR',
      'The request could not be completed.',
      'Retry later with exponential backoff. See /docs.',
    );
  }
};
