/**
 * Umami Dashboard — extended analytics proxy for the Umami analytics API.
 * Provides dashboard stats, top pages, referrers, events, and realtime data.
 *
 * GET /umami-dashboard/stats      — dashboard statistics
 * GET /umami-dashboard/pages      — top pages
 * GET /umami-dashboard/referrers  — top referrers
 * GET /umami-dashboard/events     — event tracking
 * GET /umami-dashboard/realtime   — realtime visitors
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';

const umamiDashboard = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// All routes require admin
umamiDashboard.use('*', requireAuth as any, requireAdmin as any);

// ── Helpers ──────────────────────────────────────────────────────────────────

type Period = '24h' | '7d' | '30d';

function getPeriodRange(period: Period): { startAt: number; endAt: number } {
  const now = Date.now();
  const durations: Record<Period, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const duration = durations[period] || durations['24h'];
  return { startAt: now - duration, endAt: now };
}

async function umamiProxy(
  env: Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string },
  path: string,
  params?: Record<string, string>,
): Promise<Response> {
  const url = new URL(`${env.UMAMI_API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.UMAMI_API_KEY}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(
      JSON.stringify({ error: `Umami API error: ${response.status}`, details: text }),
      { status: response.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const data = await response.json();
  return new Response(
    JSON.stringify({ data, error: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// ── GET /umami-dashboard/stats ───────────────────────────────────────────────

umamiDashboard.get('/stats', async (c) => {
  const env = c.env as Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string };
  const period = (c.req.query('period') || '24h') as Period;
  const { startAt, endAt } = getPeriodRange(period);

  return umamiProxy(env, `/api/websites/${env.UMAMI_WEBSITE_ID}/stats`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
  });
});

// ── GET /umami-dashboard/pages ───────────────────────────────────────────────

umamiDashboard.get('/pages', async (c) => {
  const env = c.env as Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string };
  const period = (c.req.query('period') || '24h') as Period;
  const limit = c.req.query('limit') || '10';
  const { startAt, endAt } = getPeriodRange(period);

  return umamiProxy(env, `/api/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
    type: 'url',
    limit,
  });
});

// ── GET /umami-dashboard/referrers ───────────────────────────────────────────

umamiDashboard.get('/referrers', async (c) => {
  const env = c.env as Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string };
  const period = (c.req.query('period') || '24h') as Period;
  const limit = c.req.query('limit') || '10';
  const { startAt, endAt } = getPeriodRange(period);

  return umamiProxy(env, `/api/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
    type: 'referrer',
    limit,
  });
});

// ── GET /umami-dashboard/events ──────────────────────────────────────────────

umamiDashboard.get('/events', async (c) => {
  const env = c.env as Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string };
  const period = (c.req.query('period') || '24h') as Period;
  const { startAt, endAt } = getPeriodRange(period);

  return umamiProxy(env, `/api/websites/${env.UMAMI_WEBSITE_ID}/events`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
  });
});

// ── GET /umami-dashboard/realtime ────────────────────────────────────────────

umamiDashboard.get('/realtime', async (c) => {
  const env = c.env as Env & { UMAMI_API_URL: string; UMAMI_API_KEY: string; UMAMI_WEBSITE_ID: string };

  return umamiProxy(env, `/api/websites/${env.UMAMI_WEBSITE_ID}/active`);
});

export { umamiDashboard };
