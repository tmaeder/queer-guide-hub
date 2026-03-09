import type { Env } from './types';

const DEFAULT_ORIGINS = new Set([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
]);

export function getAllowedOrigins(env: Env): Set<string> {
  if (env.ALLOWED_ORIGINS) {
    return new Set(env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()));
  }
  return DEFAULT_ORIGINS;
}

export function getOrigin(req: Request): string {
  const o = req.headers.get('Origin') || '';
  if (o) return o;
  const ref = req.headers.get('Referer') || '';
  try {
    return ref ? new URL(ref).origin : '';
  } catch {
    return '';
  }
}

export function buildCorsHeaders(origin: string, env: Env): Record<string, string> {
  const allowed = getAllowedOrigins(env);
  const allowOrigin = allowed.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...(allowOrigin
      ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' }
      : {}),
  };
}

export function corsResponse(req: Request, env: Env): Response {
  return new Response(null, { headers: buildCorsHeaders(getOrigin(req), env) });
}

export function jsonResponse(
  data: unknown,
  status: number,
  req: Request,
  env: Env,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...buildCorsHeaders(getOrigin(req), env),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status: number,
  req: Request,
  env: Env,
): Response {
  return jsonResponse({ error: message }, status, req, env);
}
