import type { Env } from '../types';
import { jsonResponse, errorResponse, corsResponse, getAllowedOrigins, getOrigin } from '../cors';

function validateOrigin(req: Request, env: Env): string | null {
  const origin = getOrigin(req);
  if (!getAllowedOrigins(env).has(origin)) return 'Origin not allowed';
  return null;
}

export async function handleCacheGet(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  const err = validateOrigin(req, env);
  if (err) return errorResponse(err, 403, req, env);

  try {
    const { key } = await req.json<{ key?: string }>();
    if (!key) return errorResponse('Key is required', 400, req, env);

    const value = await env.CACHE.get(key);
    return jsonResponse({ success: true, data: value ? JSON.parse(value) : null, key }, 200, req, env);
  } catch (err) {
    console.error('Cache GET error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}

export async function handleCacheSet(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  const err = validateOrigin(req, env);
  if (err) return errorResponse(err, 403, req, env);

  try {
    const { key, value, ttl } = await req.json<{
      key?: string;
      value?: unknown;
      ttl?: number;
    }>();

    if (!key || value === undefined) {
      return errorResponse('Key and value are required', 400, req, env);
    }

    if (!key.startsWith('app:') && !key.startsWith('cache:')) {
      return errorResponse('Invalid key prefix', 400, req, env);
    }

    const options: KVNamespacePutOptions = {};
    if (ttl && ttl > 0) options.expirationTtl = ttl;

    await env.CACHE.put(key, JSON.stringify(value), options);
    return jsonResponse({ success: true, data: 'OK', key, ttl: ttl || null }, 200, req, env);
  } catch (err) {
    console.error('Cache SET error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}

export async function handleCacheDelete(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  const err = validateOrigin(req, env);
  if (err) return errorResponse(err, 403, req, env);

  try {
    const { key } = await req.json<{ key?: string }>();
    if (!key) return errorResponse('Key is required', 400, req, env);

    if (!key.startsWith('app:') && !key.startsWith('cache:')) {
      return errorResponse('Invalid key prefix', 400, req, env);
    }

    await env.CACHE.delete(key);
    return jsonResponse({ success: true, deleted: true, key }, 200, req, env);
  } catch (err) {
    console.error('Cache DELETE error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}

export async function handleCacheKeys(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  const err = validateOrigin(req, env);
  if (err) return errorResponse(err, 403, req, env);

  try {
    let { pattern = '*' } = await req.json<{ pattern?: string }>();
    if (pattern === '*') pattern = 'app:';

    // KV list uses prefix, not glob
    const prefix = pattern.replace(/\*$/, '');
    const listResult = await env.CACHE.list({ prefix });

    return jsonResponse(
      { success: true, keys: listResult.keys.map((k) => k.name), pattern },
      200,
      req,
      env,
    );
  } catch (err) {
    console.error('Cache KEYS error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}
