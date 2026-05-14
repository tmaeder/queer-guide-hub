/**
 * Image CDN Worker — serves images and thumbnails from R2.
 *
 * Routes:
 *   GET /{id}.{ext}           → original image from R2
 *   GET /thumb/{id}.{ext}     → 400px-wide thumbnail (generated on first request, cached in R2)
 *   PUT /upload/{id}.{ext}    → upload image to R2 (requires ADMIN_SECRET)
 *   POST /upload-batch        → upload multiple images (requires ADMIN_SECRET)
 */

interface Env {
  IMAGES: R2Bucket;
  ALLOWED_ORIGINS: string;
  THUMB_WIDTH: string;
  THUMB_QUALITY: string;
  ADMIN_SECRET?: string;
}

const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year
const THUMB_PREFIX = 'thumb/';

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
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

    // GET — serve image
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const isThumb = path.startsWith(THUMB_PREFIX);
    const key = isThumb ? path.slice(THUMB_PREFIX.length) : path;

    if (!key || key.includes('..')) {
      return new Response('Not found', { status: 404 });
    }

    // Try to serve from R2
    if (isThumb) {
      return serveThumb(req, env, ctx, key);
    }
    return serveOriginal(req, env, key);
  },
};

async function serveOriginal(req: Request, env: Env, key: string): Promise<Response> {
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const ext = key.split('.').pop() || 'jpg';
  return new Response(obj.body, {
    headers: {
      ...corsHeaders(req, env),
      'Content-Type': obj.httpMetadata?.contentType || contentType(ext),
      'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
      'ETag': obj.etag,
    },
  });
}

async function serveThumb(req: Request, env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  const thumbKey = `${THUMB_PREFIX}${key}`;

  // Check if thumbnail already exists in R2
  const cached = await env.IMAGES.get(thumbKey);
  if (cached) {
    const ext = key.split('.').pop() || 'jpg';
    return new Response(cached.body, {
      headers: {
        ...corsHeaders(req, env),
        'Content-Type': cached.httpMetadata?.contentType || contentType(ext),
        'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
        'ETag': cached.etag,
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

  // Use CF Image Resizing if available (Pro+ zones)
  // Falls back to serving original if not available
  const thumbWidth = parseInt(env.THUMB_WIDTH || '400');
  const thumbQuality = parseInt(env.THUMB_QUALITY || '80');

  try {
    // Attempt CF Image Resizing via subrequest
    const originalBytes = await original.arrayBuffer();
    const blob = new Blob([originalBytes], { type: ct });
    const blobUrl = URL.createObjectURL(blob);

    // Try using the transform API
    const transformedRes = await fetch(blobUrl, {
      cf: {
        image: {
          width: thumbWidth,
          quality: thumbQuality,
          format: 'webp',
          fit: 'cover',
        },
      },
    } as RequestInit);

    if (transformedRes.ok) {
      const thumbBytes = await transformedRes.arrayBuffer();

      // Store thumbnail in R2 for future requests
      ctx.waitUntil(
        env.IMAGES.put(thumbKey, thumbBytes, {
          httpMetadata: { contentType: 'image/webp' },
        })
      );

      return new Response(thumbBytes, {
        headers: {
          ...corsHeaders(req, env),
          'Content-Type': 'image/webp',
          'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
          'X-Thumb': 'generated',
        },
      });
    }
  } catch {
    // CF Image Resizing not available — serve original
  }

  // Fallback: serve original as-is
  const fallbackBytes = await env.IMAGES.get(key);
  if (!fallbackBytes) return new Response('Not found', { status: 404 });

  return new Response(fallbackBytes.body, {
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
  return provided === secret;
}
