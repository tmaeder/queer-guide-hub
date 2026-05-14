// feedback-embed
// Generates vector(768) embeddings for community_submissions rows so the
// hybrid clusterer (detect_feedback_clusters) can score semantic similarity
// between feedback/api_error items. Reuses the project's Cloudflare Workers
// AI bge-base-en-v1.5 pipeline (same model as populate-embeddings).

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { getCorsHeaders, errorResponse, getServiceClient, jsonResponse } from '../_shared/supabase-client.ts';

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const CF_EMBEDDINGS_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/embeddings`;
const CF_MODEL = '@cf/baai/bge-base-en-v1.5';
const BATCH_SIZE = 25;
const TEXT_MAX_CHARS = 1800;

interface BodyShape {
  submission_ids?: string[];
  limit?: number;
}

interface SubmissionRow {
  id: string;
  data: Record<string, unknown>;
}

function buildText(row: SubmissionRow): string {
  const d = row.data ?? {};
  const pick = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const parts = [pick('title'), pick('description'), pick('message'), pick('service'), pick('function_name')]
    .filter(Boolean)
    .join('\n');
  return parts.slice(0, TEXT_MAX_CHARS);
}

async function cfEmbed(texts: string[], token: string): Promise<number[][]> {
  const res = await fetch(CF_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CF_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`CF embeddings failed (${res.status}): ${await res.text()}`);
  const j = await res.json();
  return (j.data ?? []).map((x: { embedding: number[] }) => x.embedding);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!token) return errorResponse('CLOUDFLARE_API_TOKEN missing', 500, req);

  let body: BodyShape = {};
  try {
    body = req.method === 'POST' ? ((await req.json()) as BodyShape) : {};
  } catch {
    body = {};
  }

  const supabase = getServiceClient();
  const limit = Math.min(Math.max(1, body.limit ?? 500), 2000);

  let query = supabase
    .from('community_submissions')
    .select('id,data')
    .is('embedding', null)
    .in('content_type', ['feedback', 'api_error'])
    .limit(limit);

  if (body.submission_ids?.length) {
    query = supabase
      .from('community_submissions')
      .select('id,data')
      .in('id', body.submission_ids);
  }

  const { data: rows, error } = await query;
  if (error) return errorResponse(error.message, 500, req);

  const pending = (rows ?? []) as SubmissionRow[];
  let done = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const texts = chunk.map(buildText);
    const nonEmpty: { idx: number; text: string }[] = [];
    texts.forEach((t, idx) => {
      if (t.trim()) nonEmpty.push({ idx, text: t });
    });
    if (nonEmpty.length === 0) continue;

    try {
      const vectors = await cfEmbed(nonEmpty.map((n) => n.text), token);
      for (let k = 0; k < vectors.length; k++) {
        const row = chunk[nonEmpty[k].idx];
        const { error: updErr } = await supabase
          .from('community_submissions')
          .update({ embedding: vectors[k] })
          .eq('id', row.id);
        if (updErr) failed += 1;
        else done += 1;
      }
    } catch (e) {
      failed += chunk.length;
      console.error('[feedback-embed] chunk failed', (e as Error).message);
    }
  }

  return jsonResponse({ success: true, total: pending.length, done, failed }, 200, req);
});
