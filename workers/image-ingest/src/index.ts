/**
 * Image Ingest Worker — downloads external images → stores in R2 → updates image_assets.
 *
 * POST /run           → process one batch of pending images
 * POST /run-all       → process ALL pending images in a loop (long-running)
 * GET  /stats         → current optimization status counts
 *
 * All endpoints require X-Admin-Secret header.
 */

interface Env {
  IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  IMAGE_CDN_HOST: string;
  BATCH_SIZE: string;
  ADMIN_SECRET: string;
}

interface ImageAssetRow {
  id: string;
  url: string;
  format: string | null;
}

function extFromContentType(ct: string): string {
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('avif')) return 'avif';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('svg')) return 'svg';
  return 'jpg';
}

function formatFromExt(ext: string): string | null {
  const map: Record<string, string> = {
    jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp',
    avif: 'avif', gif: 'gif', svg: 'svg',
  };
  return map[ext] || null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (!authorize(req, env)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (req.method === 'GET' && path === 'stats') {
      return handleStats(env);
    }
    if (req.method === 'POST' && path === 'run') {
      return handleBatch(env);
    }
    if (req.method === 'POST' && path === 'run-all') {
      return handleRunAll(env);
    }

    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const batchSize = parseInt(env.BATCH_SIZE || '20');
    const result = await processBatch(env, batchSize);
    console.log(`Cron ingest: processed=${result.processed} ok=${result.ok} failed=${result.failed} remaining=${result.remaining}`);
  },
};

async function handleStats(env: Env): Promise<Response> {
  const res = await supabaseQuery(env,
    `SELECT optimization_status, count(*)::int AS cnt FROM image_assets WHERE status = 'active' GROUP BY 1 ORDER BY 2 DESC`
  );
  return json({ stats: res });
}

async function handleBatch(env: Env): Promise<Response> {
  const batchSize = parseInt(env.BATCH_SIZE || '20');
  const result = await processBatch(env, batchSize);
  return json(result);
}

async function handleRunAll(env: Env): Promise<Response> {
  const batchSize = parseInt(env.BATCH_SIZE || '20');
  let totalProcessed = 0;
  let totalOk = 0;
  let totalFailed = 0;
  let remaining = Infinity;

  while (remaining > 0) {
    const result = await processBatch(env, batchSize);
    totalProcessed += result.processed;
    totalOk += result.ok;
    totalFailed += result.failed;
    remaining = result.remaining;

    if (result.processed === 0) break;
  }

  return json({
    done: true,
    total_processed: totalProcessed,
    total_ok: totalOk,
    total_failed: totalFailed,
  });
}

async function processBatch(env: Env, batchSize: number): Promise<{
  processed: number; ok: number; failed: number; remaining: number;
}> {
  // Fetch pending images from Supabase
  const pendingUrl = `${env.SUPABASE_URL}/rest/v1/image_assets?select=id,url,format&status=eq.active&optimization_status=eq.pending&order=created_at.asc&limit=${batchSize}`;
  const pendingRes = await fetch(pendingUrl, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!pendingRes.ok) {
    console.error('Failed to fetch pending images:', await pendingRes.text());
    return { processed: 0, ok: 0, failed: 0, remaining: 0 };
  }

  const rows = await pendingRes.json() as ImageAssetRow[];
  if (rows.length === 0) {
    return { processed: 0, ok: 0, failed: 0, remaining: 0 };
  }

  // Get remaining count
  const countRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/image_assets?select=id&status=eq.active&optimization_status=eq.pending`,
    {
      method: 'HEAD',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'count=exact',
      },
    },
  );
  const remaining = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');

  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    const success = await ingestImage(env, row);
    if (success) ok++;
    else failed++;
  }

  return { processed: rows.length, ok, failed, remaining: remaining - rows.length };
}

async function ingestImage(env: Env, row: ImageAssetRow): Promise<boolean> {
  const { id, url } = row;

  // Skip data URIs and invalid URLs
  if (!url || url.startsWith('data:') || url.length < 10) {
    await updateAsset(env, id, { optimization_status: 'skipped' });
    return false;
  }

  // Mark as processing
  await updateAsset(env, id, { optimization_status: 'processing' });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'QueerGuide-ImageIngest/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      await updateAsset(env, id, { optimization_status: 'failed' });
      return false;
    }

    const ct = res.headers.get('Content-Type') || 'image/jpeg';
    const body = await res.arrayBuffer();

    if (body.byteLength < 100) {
      await updateAsset(env, id, { optimization_status: 'failed' });
      return false;
    }

    const ext = extFromContentType(ct);
    const key = `${id}.${ext}`;

    // Upload to R2
    await env.IMAGES.put(key, body, {
      httpMetadata: { contentType: ct },
    });

    // Build CDN URLs
    const cdnBase = `https://${env.IMAGE_CDN_HOST}`;
    const optimizedUrl = `${cdnBase}/${key}`;
    const thumbnailUrl = `${cdnBase}/thumb/${key}`;
    const format = formatFromExt(ext);

    await updateAsset(env, id, {
      optimization_status: 'optimized',
      optimized_url: optimizedUrl,
      thumbnail_url: thumbnailUrl,
      optimized_at: new Date().toISOString(),
      bytes: body.byteLength,
      ...(format ? { format } : {}),
    });

    return true;
  } catch (err) {
    console.error(`Ingest failed for ${id}:`, (err as Error).message);
    await updateAsset(env, id, { optimization_status: 'failed' });
    return false;
  }
}

async function updateAsset(env: Env, id: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/image_assets?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function supabaseQuery(env: Env, sql: string): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    // Fallback: use PostgREST aggregate
    const statsRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/image_assets?select=optimization_status&status=eq.active`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const rows = await statsRes.json() as Array<{ optimization_status: string }>;
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.optimization_status] = (counts[r.optimization_status] || 0) + 1;
    }
    return Object.entries(counts).map(([k, v]) => ({ optimization_status: k, cnt: v }));
  }
  return res.json();
}

function authorize(req: Request, env: Env): boolean {
  const secret = env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get('X-Admin-Secret') === secret;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
