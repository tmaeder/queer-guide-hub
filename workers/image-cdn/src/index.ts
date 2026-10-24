/**
 * Image CDN Worker — serves images and thumbnails from R2.
 *
 * Routes:
 *   GET/HEAD /{id}.{ext}      → original image or its metadata from R2
 *   GET/HEAD /thumb/{id}.{ext} → thumbnail or its metadata
 *   PUT /upload/{id}.{ext}    → upload image to R2 (requires ADMIN_SECRET)
 *   POST /upload-batch        → upload multiple images (requires ADMIN_SECRET)
 *   POST /avatar/resolve      → privacy proxy: resolve via unavatar.io, cache in R2
 *                               (requires Supabase user JWT)
 */

import { handleAvatarResolve } from './avatarResolve';
import { handleSocialResolve } from './socialCardResolve';
import { timingSafeEqual } from '../../_shared/timing-safe';

interface Env {
  IMAGES: R2Bucket;
  ALLOWED_ORIGINS: string;
  THUMB_WIDTH: string;
  THUMB_QUALITY: string;
  ADMIN_SECRET?: string;
  SOCIAL_RESOLVE_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
}

const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year
const THUMB_PREFIX = 'thumb/';

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
  };
}

function contentType(ext: string): string {
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
    svg: 'image/svg+xml', heic: 'image/heic',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(req, env) });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, '');

    // PUT /upload/{key} — single image upload
    if (req.method === 'PUT' && path.startsWith('upload/')) {
      return handleUpload(req, env, path.replace('upload/', ''));
    }

    // POST /upload-batch — batch upload
    if (req.method === 'POST' && path === 'upload-batch') {
      return handleBatchUpload(req, env);
    }

    // POST /avatar/resolve — unavatar privacy proxy
    if (req.method === 'POST' && path === 'avatar/resolve') {
      return handleAvatarResolve(req, env, corsHeaders(req, env));
    }

    // POST /social/resolve — privacy-safe social-card resolver (server-only)
    if (req.method === 'POST' && path === 'social/resolve') {
      return handleSocialResolve(req, env, corsHeaders(req, env));
    }

    // Image probes use HEAD before requesting any bytes. Rejecting it marks
    // publicly readable assets as unreachable across all quality workers.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const isThumb = path.startsWith(THUMB_PREFIX);
    const key = isThumb ? path.slice(THUMB_PREFIX.length) : path;

    if (!key || key.includes('..')) {
      return new Response(req.method === 'HEAD' ? null : 'Not found', { status: 404 });
    }

    // Try to serve from R2
    if (isThumb) {
      if (req.method === 'HEAD') {
        const cached = await env.IMAGES.head(`${THUMB_PREFIX}${key}`);
        if (cached) return new Response(null, { headers: { ...imageHeaders(req, env, key, cached), 'X-Thumb': 'cached' } });
        // An uncached thumbnail can differ from its original. Build the same
        // representation as GET rather than reporting the original's metadata.
        const response = await serveThumb(req, env, ctx, key);
        await response.body?.cancel();
        return new Response(null, { status: response.status, headers: response.headers });
      }
      return serveThumb(req, env, ctx, key);
    }
    return serveOriginal(req, env, key);
  },
};

function imageHeaders(req: Request, env: Env, key: string, obj: R2Object): Record<string, string> {
  return {
    ...corsHeaders(req, env),
    'Content-Type': obj.httpMetadata?.contentType || contentType(key.split('.').pop() || 'jpg'),
    'Content-Length': String(obj.size),
    'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
    'ETag': obj.httpEtag,
  };
}

async function serveOriginal(req: Request, env: Env, key: string): Promise<Response> {
  if (req.method === 'HEAD') {
    const metadata = await env.IMAGES.head(key);
    return metadata ? new Response(null, { headers: imageHeaders(req, env, key, metadata) })
      : new Response(null, { status: 404 });
  }
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: imageHeaders(req, env, key, obj),
  });
}

async function serveThumb(req: Request, env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  const thumbKey = `${THUMB_PREFIX}${key}`;

  // Check if thumbnail already exists in R2
  const cached = await env.IMAGES.get(thumbKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        ...imageHeaders(req, env, key, cached),
        'X-Thumb': 'cached',
      },
    });
  }

  // Get original to generate thumbnail
  const original = await env.IMAGES.get(key);
  if (!original) return new Response('Not found', { status: 404 });

  const ext = key.split('.').pop() || 'jpg';
  const ct = original.httpMetadata?.contentType || contentType(ext);

  // For SVGs, just serve the original — no resize needed
  if (ct.includes('svg')) {
    return new Response(original.body, {
      headers: {
        ...corsHeaders(req, env),
        'Content-Type': ct,
        'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
      },
    });
  }

  // Use CF Image Resizing (paid plan) — fetch the public R2 URL with cf.image options.
  // The Worker can fetch its own zone without recursion because the original path
  // (/{key}) does not match the thumb prefix, so it won't re-enter this branch.
  const width = parseInt(env.THUMB_WIDTH) || 400;
  const quality = parseInt(env.THUMB_QUALITY) || 80;
  const publicUrl = `https://img.queer.guide/${key}`;

  try {
    const resized = await fetch(publicUrl, {
      cf: { image: { width, quality, format: 'webp' as const } },
    });

    if (resized.ok) {
      const body = await resized.arrayBuffer();
      ctx.waitUntil(
        env.IMAGES.put(thumbKey, body, { httpMetadata: { contentType: 'image/webp' } }),
      );
      return new Response(body, {
        headers: {
          ...corsHeaders(req, env),
          'Content-Type': 'image/webp',
          'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
          'X-Thumb': 'generated',
        },
      });
    }
  } catch {
    // fall through to original
  }

  return new Response(original.body, {
    headers: {
      ...corsHeaders(req, env),
      'Content-Type': ct,
      'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
      'X-Thumb': 'fallback',
    },
  });
}

async function handleUpload(req: Request, env: Env, key: string): Promise<Response> {
  if (!authorize(req, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ct = req.headers.get('Content-Type') || 'image/jpeg';
  const body = await req.arrayBuffer();

  await env.IMAGES.put(key, body, {
    httpMetadata: { contentType: ct },
  });

  return new Response(JSON.stringify({ key, size: body.byteLength }), {
    headers: { ...corsHeaders(req, env), 'Content-Type': 'application/json' },
  });
}

async function handleBatchUpload(req: Request, env: Env): Promise<Response> {
  if (!authorize(req, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { items } = await req.json() as {
    items: Array<{ key: string; url: string }>;
  };

  if (!items || !Array.isArray(items)) {
    return new Response(JSON.stringify({ error: 'items array required' }), { status: 400 });
  }

  const results: Array<{ key: string; status: string; size?: number; error?: string }> = [];

  for (const item of items.slice(0, 20)) {
    try {
      const res = await fetch(item.url, {
        headers: { 'User-Agent': 'QueerGuide-ImageCDN/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        results.push({ key: item.key, status: 'failed', error: `HTTP ${res.status}` });
        continue;
      }

      const ct = res.headers.get('Content-Type') || 'image/jpeg';
      const body = await res.arrayBuffer();

      if (body.byteLength < 100) {
        results.push({ key: item.key, status: 'failed', error: 'Too small' });
        continue;
      }

      await env.IMAGES.put(item.key, body, {
        httpMetadata: { contentType: ct },
      });

      results.push({ key: item.key, status: 'ok', size: body.byteLength });
    } catch (err) {
      results.push({ key: item.key, status: 'failed', error: (err as Error).message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  return new Response(JSON.stringify({ processed: results.length, ok, failed: results.length - ok, results }), {
    headers: { ...corsHeaders(req, env), 'Content-Type': 'application/json' },
  });
}

function authorize(req: Request, env: Env): boolean {
  const secret = env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('X-Admin-Secret') || req.headers.get('Authorization')?.replace('Bearer ', '');
  return timingSafeEqual(provided, secret);
}
