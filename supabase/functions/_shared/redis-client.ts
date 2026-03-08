import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
]);

export function getOrigin(req: Request): string {
  const o = req.headers.get('Origin') || '';
  if (o) return o;
  const ref = req.headers.get('Referer') || '';
  try {
    return ref ? new URL(ref).origin : '';
  } catch {
    return '';
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const rip = req.headers.get('x-real-ip');
  if (rip) return rip.trim();
  return 'unknown';
}

export function buildCors(origin: string): Record<string, string> {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
  };
}

export function getRedisCredentials(): { url: string; token: string } {
  const url = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) throw new Error('Missing Redis credentials');
  return { url, token };
}

export interface RateLimitConfig {
  identifier: string
  maxAttempts: number
  timeWindowMinutes: number
}

/**
 * Validates origin and checks rate limit.
 * Returns an error Response if the request should be rejected, or null if OK.
 */
export async function validateRedisRequest(
  req: Request,
  origin: string,
  rateLimitConfig: RateLimitConfig
): Promise<Response | null> {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  if (supabase) {
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit_key', {
      identifier: rateLimitConfig.identifier,
      max_attempts: rateLimitConfig.maxAttempts,
      time_window_minutes: rateLimitConfig.timeWindowMinutes,
    });
    if (rlError) console.error('Rate limit RPC error:', rlError);
    if (allowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
