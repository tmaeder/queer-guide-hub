/**
 * Storage routes — replaces Supabase Storage with Cloudflare R2.
 *
 * POST   /storage/:bucket/upload   — upload file
 * GET    /storage/:bucket/:path+   — download / serve file
 * DELETE /storage/:bucket/:path+   — delete file
 * GET    /storage/:bucket/public/:path+ — public URL (redirect to R2)
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';

const storage = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

// Buckets that allow public read
const PUBLIC_BUCKETS = new Set([
  'avatars', 'cms-media', 'city-images', 'tag-images',
]);

// Map of allowed MIME types per bucket
const BUCKET_MIME_TYPES: Record<string, Set<string>> = {
  avatars: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  'cms-media': new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  'flyer-scans': new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  videos: new Set(['video/mp4', 'video/webm']),
  audio: new Set(['audio/mpeg', 'audio/mp3', 'audio/wav']),
  'user-photos': new Set(['image/jpeg', 'image/png', 'image/webp']),
};

/** Build R2 key: bucket/path */
function r2Key(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

/** Upload a file */
storage.post('/:bucket/upload', requireAuth as any, async (c) => {
  const bucket = c.req.param('bucket')!;

  // Parse multipart form
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const path = formData.get('path') as string || '';

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // Check MIME type
  const allowed = BUCKET_MIME_TYPES[bucket];
  if (allowed && !allowed.has(file.type)) {
    return c.json({ error: `File type ${file.type} not allowed in ${bucket}` }, 400);
  }

  // Check file size (50MB max)
  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 50MB)' }, 400);
  }

  const key = r2Key(bucket, path || file.name);

  await c.env.STORAGE.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      uploadedBy: (c.get('user') as AuthUser).id,
      originalName: file.name,
    },
  });

  return c.json({
    data: {
      path: key,
      fullPath: key,
    },
    error: null,
  });
});

/** Get public URL for a file */
storage.get('/:bucket/public/*', async (c) => {
  const bucket = c.req.param('bucket')!;
  const path = c.req.path.replace(`/storage/${bucket}/public/`, '');
  const key = r2Key(bucket, path);

  const obj = await c.env.STORAGE.get(key);
  if (!obj) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', obj.etag);

  return new Response(obj.body, { headers });
});

/** Download a file */
storage.get('/:bucket/*', optionalAuth, async (c) => {
  const bucket = c.req.param('bucket')!;
  const path = c.req.path.replace(`/storage/${bucket}/`, '');
  const user = c.get('user');

  // Check access for private buckets
  if (!PUBLIC_BUCKETS.has(bucket) && !user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const key = r2Key(bucket, path);
  const obj = await c.env.STORAGE.get(key);

  if (!obj) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', PUBLIC_BUCKETS.has(bucket) ? 'public, max-age=86400' : 'private, max-age=3600');
  headers.set('ETag', obj.etag);

  return new Response(obj.body, { headers });
});

/** Delete a file */
storage.delete('/:bucket/*', requireAuth as any, async (c) => {
  const bucket = c.req.param('bucket')!;
  const path = c.req.path.replace(`/storage/${bucket}/`, '');
  const key = r2Key(bucket, path);

  await c.env.STORAGE.delete(key);
  return c.json({ data: null, error: null });
});

export { storage };
