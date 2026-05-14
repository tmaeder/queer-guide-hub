/**
 * extract-document-fields — auto-fill the document vault from a photo.
 *
 * Input  (POST JSON):
 *   { image_b64: string, mime_type: string, hint_doc_type?: DocType }
 *
 * Output:
 *   { title?, doc_type?, expiry_date?, country_code?, confidence: number }
 *
 * Uses Cloudflare Workers AI `@cf/meta/llama-3.2-11b-vision-instruct` for
 * the multimodal extraction. The project standardised on CF AI so creds +
 * billing live in one place.
 *
 * Auth: requires a valid Supabase JWT. The function doesn't write anything
 * itself — the client receives a suggestion and the user confirms before
 * storing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN')!;
const CF_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

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

Output strict JSON (omit any field you can't see clearly):
{
  "title": string | null,
  "doc_type": "passport" | "id_card" | "visa" | "vaccine" | "insurance" | "flight_ticket" | "hotel_voucher" | "event_ticket" | "other",
  "expiry_date": "YYYY-MM-DD" | null,
  "country_code": "XX" | null,
  "confidence": number
}

Rules: never invent fields. Only return doc_type values from the enum. expiry_date in ISO YYYY-MM-DD. Output ONLY the JSON object — no prose, no markdown fences.`;

/** Decode base64 to number array for CF's uint8array image input. */
function b64ToBytes(b64: string): number[] {
  const bin = atob(b64);
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const auth = req.headers.get('authorization');
  if (!auth) return jsonResp({ error: 'auth required' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jsonResp({ error: 'invalid session' }, 401);

  let body: { image_b64?: string; mime_type?: string; hint_doc_type?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: 'invalid json' }, 400);
  }
  const { image_b64, mime_type, hint_doc_type } = body;
  if (!image_b64 || !mime_type) return jsonResp({ error: 'image_b64 and mime_type required' }, 400);
  if (!ALLOWED_MIME.has(mime_type)) return jsonResp({ error: 'unsupported mime_type' }, 400);
  if (image_b64.length > Math.ceil(MAX_INPUT_BYTES * 1.4)) {
    return jsonResp({ error: 'image too large (max ~4 MB)' }, 413);
  }

  const userMessage = hint_doc_type
    ? `Extract fields from this document. The user hinted it's likely a "${hint_doc_type}" — use that as a strong prior unless the image clearly disagrees.`
    : 'Extract fields from this document.';

  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
  const resp = await fetch(cfUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      image: b64ToBytes(image_b64),
      prompt: `${SYSTEM_PROMPT}\n\n${userMessage}`,
      max_tokens: 512,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return jsonResp({ error: 'extraction failed', detail: detail.slice(0, 400) }, 502);
  }

  const json = await resp.json();
  const text: string = json?.result?.description ?? json?.result?.response ?? '';

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return jsonResp({ confidence: 0 });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return jsonResp({ confidence: 0 });
  }

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
  if (typeof parsed.expiry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date)) {
    out.expiry_date = parsed.expiry_date;
  }
  if (typeof parsed.country_code === 'string' && /^[A-Za-z]{2}$/.test(parsed.country_code)) {
    out.country_code = parsed.country_code.toUpperCase();
  }
  if (typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1) {
    out.confidence = parsed.confidence;
  }

  return jsonResp(out);
});
