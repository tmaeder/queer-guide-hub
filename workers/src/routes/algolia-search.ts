/**
 * algolia-search — 410 Gone stub.
 * Algolia was removed; this returns a migration notice.
 */
import type { Env } from '../types';
import { jsonResponse } from '../cors';

export async function handleAlgoliaSearch(req: Request, env: Env): Promise<Response> {
  return jsonResponse(
    {
      error: 'Algolia search has been removed. Use the /functions/v1/search endpoint instead.',
      migration:
        'POST /functions/v1/search with {query, filters: {types, location, categories, featured, rating}, hitsPerPage}',
    },
    410,
    req,
    env,
  );
}
