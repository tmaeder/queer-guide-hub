/**
 * cms-ai — multi-op AI assistant for the CMS editor.
 *
 * Operations:
 *   - summarize       → short summary suitable for excerpt/meta_description
 *   - alt_text        → image alt text from a description + URL
 *   - seo_draft       → meta_title + meta_description draft
 *   - auto_tag        → tag suggestions from existing unified_tags
 *   - fact_check      → flags potentially-stale or unverified claims
 *
 * Body shape:
 *   {
 *     op: 'summarize' | 'alt_text' | 'seo_draft' | 'auto_tag' | 'fact_check',
 *     content_type: string,   // registry id (e.g. 'venues')
 *     record_id: string,
 *     locale?: string,        // for summarize/seo_draft outputs
 *     source: Record<string, unknown>, // fields the editor has loaded
 *   }
 *
 * Response:
 *   { ok: true, op, output } | { ok: false, error }
 *
 * Output is shape-validated client-side against the per-type Zod schema in
 * lib/cms/zodFromFields before being applied.
 *
 * Backed by the self-hosted Gemma endpoint (see _shared/llm-client.ts) for
 * EU data residency. Caches by SHA-256 of (op, content_type, record_id, locale, source_hash)
 * via a small `cms_ai_cache` table — no external infra.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { llmChatCompletion, isLlmConfigured } from '../_shared/llm-client.ts';

type AIOp = 'summarize' | 'alt_text' | 'seo_draft' | 'auto_tag' | 'fact_check';

interface Body {
  op: AIOp;
  content_type: string;
  record_id: string;
  locale?: string;
  source: Record<string, unknown>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildPrompt(op: AIOp, body: Body): { system: string; user: string } {
  const src = JSON.stringify(body.source).slice(0, 8000);
  const locale = body.locale ?? 'en';
  switch (op) {
    case 'summarize':
      return {
        system: `You write concise editorial summaries for an LGBTQ+ travel platform. Output only the summary text, no preamble. Target locale: ${locale}.`,
        user: `Summarize this ${body.content_type} record in 2-3 sentences (max 280 chars):\n${src}`,
      };
    case 'alt_text':
      return {
        system: `You write descriptive image alt text for accessibility. Output only the alt text, max 120 chars. No quotes.`,
        user: `Generate alt text for an image of this ${body.content_type}:\n${src}`,
      };
    case 'seo_draft':
      return {
        system: `You write SEO meta tags for an LGBTQ+ travel platform. Output strict JSON: {"meta_title": "...", "meta_description": "..."}. Title <=60 chars, description <=155 chars. Locale: ${locale}.`,
        user: `Generate SEO metadata for this ${body.content_type}:\n${src}`,
      };
    case 'auto_tag':
      return {
        system: `You select relevant tags from an existing taxonomy. Output strict JSON: {"tags": ["slug1", "slug2", ...]}. Return at most 8 tags. Use only kebab-case slugs.`,
        user: `Suggest tags for this ${body.content_type}:\n${src}`,
      };
    case 'fact_check':
      return {
        system: `You flag potentially-stale or unverifiable claims in editorial content. Output strict JSON: {"issues": [{"field": "...", "claim": "...", "concern": "..."}]}. Empty array if nothing to flag.`,
        user: `Review this ${body.content_type} for stale or unverified claims:\n${src}`,
      };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!isLlmConfigured()) {
    return new Response(
      JSON.stringify({ ok: false, error: 'LLM not configured (QG_LLM_BASE_URL/QG_LLM_API_KEY)' }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!body.op || !body.content_type || !body.record_id || !body.source) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing required fields' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const sourceHash = await sha256(JSON.stringify(body.source));
  const cacheKey = `${body.op}:${body.content_type}:${body.record_id}:${body.locale ?? 'en'}:${sourceHash}`;

  // Cache lookup (best-effort; ignore errors)
  try {
    const { data: cached } = await supabase
      .from('cms_ai_cache')
      .select('output')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cached?.output) {
      return new Response(
        JSON.stringify({ ok: true, op: body.op, output: cached.output, cached: true }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
  } catch {
    // table may not exist yet; continue
  }

  const prompt = buildPrompt(body.op, body);
  const wantsJson = body.op === 'seo_draft' || body.op === 'auto_tag' || body.op === 'fact_check';

  let result;
  try {
    result = await llmChatCompletion({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.2,
      max_tokens: 600,
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      timeoutMs: 30_000,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'LLM error' }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  let output: unknown = result.content.trim();
  if (wantsJson) {
    try {
      output = JSON.parse(result.content);
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'LLM returned invalid JSON', raw: result.content }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
  }

  // Best-effort cache write
  try {
    await supabase.from('cms_ai_cache').upsert(
      {
        cache_key: cacheKey,
        op: body.op,
        content_type: body.content_type,
        record_id: body.record_id,
        locale: body.locale ?? 'en',
        output: output as never,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );
  } catch {
    // ignore
  }

  return new Response(
    JSON.stringify({ ok: true, op: body.op, output, model: result.model }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
