/**
 * generate-usernames — produce 5 unique queer.guide usernames via LLM.
 *
 * POST (no body required). Returns { usernames: string[] }.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT =
  'You are a programmatic username generation API for queer.guide. Generate exactly 5 unique usernames blending at least two of these themes: queer culture/slang, traveling/exploration, kink/sex-positivity, and creativity/art. Length: 8-15 chars. Format: PascalCase. Avoid numbers/special chars. Output ONLY minified JSON matching this schema: { "usernames": [ "String", "String", "String", "String", "String" ] }';

const FORMAT_RE = /^[A-Za-z][A-Za-z0-9]{7,14}$/;

async function callLLM(): Promise<string[]> {
  const resp = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    temperature: 0.8,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: 'Generate.' }],
  });
  const raw = resp?.content?.[0]?.text;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no json in response: ' + text.slice(0, 200));
  const parsed = JSON.parse(match[0]) as { usernames?: unknown };
  if (!Array.isArray(parsed.usernames)) throw new Error('invalid schema');
  return parsed.usernames.filter(
    (u): u is string => typeof u === 'string' && FORMAT_RE.test(u),
  );
}

async function generateBatch(): Promise<string[]> {
  try {
    return await callLLM();
  } catch (_err) {
    return await callLLM();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const candidates: string[] = [];
    for (let attempt = 0; attempt < 2 && candidates.length < 5; attempt++) {
      const batch = await generateBatch();
      const lower = batch.map((u) => u.toLowerCase());
      const { data: taken } = await admin
        .from('profiles')
        .select('username')
        .in('username', batch);
      const takenLower = new Set(
        (taken ?? [])
          .map((r: { username: string | null }) => r.username?.toLowerCase())
          .filter(Boolean),
      );
      for (let i = 0; i < batch.length; i++) {
        if (!takenLower.has(lower[i]) && !candidates.includes(batch[i])) {
          candidates.push(batch[i]);
        }
      }
    }

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'generation failed' }),
        { status: 502, headers: { ...cors, 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ usernames: candidates.slice(0, 5) }),
      { headers: { ...cors, 'content-type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
