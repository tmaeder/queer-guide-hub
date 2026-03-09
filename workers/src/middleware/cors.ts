import { Context, Next } from 'hono';
import type { Env } from '../types';

const DEFAULT_ORIGINS = new Set([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
]);

function getAllowedOrigins(env: Env): Set<string> {
  if (env.ALLOWED_ORIGINS) {
    return new Set(env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()));
  }
  return DEFAULT_ORIGINS;
}

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins(c.env);
  const allowOrigin = allowed.has(origin) ? origin : '';

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization,content-type,x-client-info',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  await next();

  if (allowOrigin) {
    c.res.headers.set('Access-Control-Allow-Origin', allowOrigin);
    c.res.headers.set('Vary', 'Origin');
  }
}
