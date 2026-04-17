/**
 * extract-document-fields — auto-fill the document vault from a photo.
 *
 * Input  (POST JSON):
 *   { image_b64: string, mime_type: string, hint_doc_type?: DocType }
 *
 * Output:
 *   { title?, doc_type?, expiry_date?, country_code?, confidence: number }
 *
 * Pipeline:
 *   1. Auth caller (just checks the JWT is present + valid; the function
 *      doesn't write — we return the suggestion to the client and let the
 *      user confirm before storing).
 *   2. Forward the image to Claude Sonnet vision with a structured-extract
 *      prompt and a tight JSON schema.
 *   3. Best-effort parse — return a partial object so the client can still
 *      prefill what was found.
 *
 * Anthropic vision accepts base64 inline up to 5 MB per image. We cap
 * input at 4 MB to leave room for the prompt + headers.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

const DOC_TYPES = [
  'passport',
  'id_card',
  'visa',
  'vaccine',
  'insurance',
  'flight_ticket',
  'hotel_voucher',
  'event_ticket',
  'other',
] as const;

interface ExtractResult {
  title?: string;
  doc_type?: (typeof DOC_TYPES)[number];
  expiry_date?: string;
  country_code?: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You extract structured fields from a photograph of a travel document.

Output strict JSON with this shape (omit any field you can't see clearly):
{
  "title": string | null,        // human label, e.g. "US passport — Jane Doe"
  "doc_type": "passport" | "id_card" | "visa" | "vaccine" | "insurance" | "flight_ticket" | "hotel_voucher" | "event_ticket" | "other",
  "expiry_date": "YYYY-MM-DD" | null,
  "country_code": "XX" | null,   // ISO 3166-1 alpha-2 of the issuing country
  "confidence": number           // 0..1, your overall confidence
}

Rules:
- Never invent fields you can't read. Prefer omission to guessing.
- Only return doc_type values from the enum above.
- expiry_date in ISO YYYY-MM-DD; nothing else.
- Output ONLY the JSON object — no prose, no markdown fences.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  const auth = req.headers.get('authorization');
  if (!auth) {
    return new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  // Verify the JWT — we don't actually need user_id, but a valid session
  // gates rate limiting (which Supabase already applies per user).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'invalid session' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  let body: { image_b64?: string; mime_type?: string; hint_doc_type?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const { image_b64, mime_type, hint_doc_type } = body;

  if (!image_b64 || !mime_type) {
    return new Response(JSON.stringify({ error: 'image_b64 and mime_type required' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  if (!ALLOWED_MIME.has(mime_type)) {
    return new Response(JSON.stringify({ error: 'unsupported mime_type' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  // Rough check on payload size — base64 expands by ~4/3.
  if (image_b64.length > Math.ceil(MAX_INPUT_BYTES * 1.4)) {
    return new Response(JSON.stringify({ error: 'image too large (max ~4 MB)' }), {
      status: 413,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const userMessage = hint_doc_type
    ? `Extract fields. The user said this is likely a "${hint_doc_type}" — use that as a strong prior unless the image clearly disagrees.`
    : `Extract fields from this document.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime_type, data: image_b64 } },
            { type: 'text', text: userMessage },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return new Response(JSON.stringify({ error: 'extraction failed', detail }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const json = await resp.json();
  const text: string = json.content?.[0]?.text ?? '{}';

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return new Response(JSON.stringify({ confidence: 0 }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return new Response(JSON.stringify({ confidence: 0 }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  // Sanitize — only keep fields that pass a basic shape check.
  const out: ExtractResult = { confidence: 0 };

  if (typeof parsed.title === 'string' && parsed.title.length > 0 && parsed.title.length < 200) {
    out.title = parsed.title;
  }
  if (
    typeof parsed.doc_type === 'string' &&
    DOC_TYPES.includes(parsed.doc_type as (typeof DOC_TYPES)[number])
  ) {
    out.doc_type = parsed.doc_type as (typeof DOC_TYPES)[number];
  }
  if (
    typeof parsed.expiry_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date)
  ) {
    out.expiry_date = parsed.expiry_date;
  }
  if (
    typeof parsed.country_code === 'string' &&
    /^[A-Za-z]{2}$/.test(parsed.country_code)
  ) {
    out.country_code = parsed.country_code.toUpperCase();
  }
  if (typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1) {
    out.confidence = parsed.confidence;
  }

  return new Response(JSON.stringify(out), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
