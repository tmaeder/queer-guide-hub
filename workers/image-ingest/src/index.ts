/**
 * Image Ingest Worker — downloads external images → stores in R2 → updates image_assets.
 *
 * POST /run           → process one batch of pending images
 * POST /run-all       → process ALL pending images in a loop (long-running)
 * POST /backfill-exif → extract EXIF from already-optimized R2 images missing metadata
 * GET  /stats         → current optimization status counts
 *
 * All endpoints require X-Admin-Secret header.
 */

import { extractExif, extractJpegDimensions, extractPngDimensions } from './exif';

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
    if (req.method === 'POST' && path === 'backfill-exif') {
      return handleBackfillExif(env);
    }

    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const batchSize = parseInt(env.BATCH_SIZE || '20');
    const result = await processBatch(env, batchSize);
    console.log(`Cron ingest: processed=${result.processed} ok=${result.ok} failed=${result.failed} remaining=${result.remaining}`);

    // After ingesting pending, backfill EXIF on optimized images missing metadata
    if (result.remaining === 0 || result.processed === 0) {
      const backfill = await backfillExifBatch(env, batchSize);
      console.log(`Cron EXIF backfill: processed=${backfill.processed} updated=${backfill.updated} skipped=${backfill.skipped}`);
    }
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

async function handleBackfillExif(env: Env): Promise<Response> {
  const batchSize = parseInt(env.BATCH_SIZE || '20');
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let hasMore = true;

  while (hasMore && totalProcessed < 500) {
    const result = await backfillExifBatch(env, batchSize);
    totalProcessed += result.processed;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    if (result.processed === 0) hasMore = false;
  }

  return json({
    done: !hasMore,
    processed: totalProcessed,
    updated: totalUpdated,
    skipped: totalSkipped,
  });
}

async function backfillExifBatch(env: Env, batchSize: number): Promise<{
  processed: number; updated: number; skipped: number;
}> {
  const url = `${env.SUPABASE_URL}/rest/v1/image_assets?select=id,format&optimization_status=eq.optimized&or=(metadata.is.null,metadata.eq.{})&limit=${batchSize}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) return { processed: 0, updated: 0, skipped: 0 };

  const rows = await res.json() as Array<{ id: string; format: string | null }>;
  if (rows.length === 0) return { processed: 0, updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const ext = row.format === 'jpeg' ? 'jpg' : (row.format || 'jpg');
    const key = `${row.id}.${ext}`;

    try {
      const obj = await env.IMAGES.get(key);
      if (!obj) {
        // Try alternate extensions
        const alts = ['jpg', 'jpeg', 'png', 'webp'];
        let found = false;
        for (const a of alts) {
          if (a === ext) continue;
          const altObj = await env.IMAGES.get(`${row.id}.${a}`);
          if (altObj) {
            const buf = await altObj.arrayBuffer();
            const result = extractMetaFromBuffer(buf, altObj.httpMetadata?.contentType || `image/${a}`);
            if (result) {
              await updateAsset(env, row.id, result);
              updated++;
            } else {
              await updateAsset(env, row.id, { metadata: { scanned: true } });
              skipped++;
            }
            found = true;
            break;
          }
        }
        if (!found) {
          await updateAsset(env, row.id, { metadata: { scanned: true } });
          skipped++;
        }
        continue;
      }

      const buf = await obj.arrayBuffer();
      const ct = obj.httpMetadata?.contentType || `image/${ext}`;
      const result = extractMetaFromBuffer(buf, ct);
      if (result) {
        await updateAsset(env, row.id, result);
        updated++;
      } else {
        await updateAsset(env, row.id, { metadata: { scanned: true } });
        skipped++;
      }
    } catch (err) {
      console.error(`Backfill failed for ${row.id}:`, (err as Error).message);
      await updateAsset(env, row.id, { metadata: { scanned: true } });
      skipped++;
    }
  }

  return { processed: rows.length, updated, skipped };
}

function extractMetaFromBuffer(buf: ArrayBuffer, ct: string): Record<string, unknown> | null {
  let metadata: Record<string, unknown> = {};
  let width: number | null = null;
  let height: number | null = null;

  if (ct.includes('jpeg') || ct.includes('jpg')) {
    const exif = extractExif(buf);
    if (exif && Object.keys(exif).length > 0) {
      metadata = { exif };
      width = exif.imageWidth ?? null;
      height = exif.imageHeight ?? null;
    }
    if (!width || !height) {
      const dims = extractJpegDimensions(buf);
      if (dims) { width = dims.width; height = dims.height; }
    }
  } else if (ct.includes('png')) {
    const dims = extractPngDimensions(buf);
    if (dims) { width = dims.width; height = dims.height; }
  }

  const hasData = Object.keys(metadata).length > 0 || width || height;
  if (!hasData) return null;

  return {
    ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: { scanned: true } }),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

async function processBatch(env: Env, batchSize: number): Promise<{
  processed: number; ok: number; failed: number; remaining: number;
}> {
  // Fetch pending images from Supabase
  const pendingUrl = `${env.SUPABASE_URL}/rest/v1/image_assets?select=id,url,format&status=eq.active&optimization_status=eq.pending&limit=${batchSize}&offset=${Math.floor(Math.random() * 100)}`;
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
    // Small delay to avoid rate-limiting from external hosts
    await new Promise(r => setTimeout(r, 200));
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
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide/1.0)' },
          signal: AbortSignal.timeout(20000),
          redirect: 'follow',
        });
        if (res.ok) break;
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        break;
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!res || !res.ok) {
      // 404/410 = image gone, don't retry. Other errors = transient, retry later.
      const status = res?.status;
      const dead = status === 404 || status === 410 || status === 403;
      await updateAsset(env, id, { optimization_status: dead ? 'failed' : 'pending' });
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

    // Extract EXIF metadata and dimensions
    let metadata: Record<string, unknown> = {};
    let width: number | null = null;
    let height: number | null = null;

    if (ct.includes('jpeg') || ct.includes('jpg')) {
      const exif = extractExif(body);
      if (exif && Object.keys(exif).length > 0) {
        metadata = { exif };
        width = exif.imageWidth ?? null;
        height = exif.imageHeight ?? null;
      }
      if (!width || !height) {
        const dims = extractJpegDimensions(body);
        if (dims) { width = dims.width; height = dims.height; }
      }
    } else if (ct.includes('png')) {
      const dims = extractPngDimensions(body);
      if (dims) { width = dims.width; height = dims.height; }
    }

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
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
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
