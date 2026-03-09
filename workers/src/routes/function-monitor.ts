/**
 * Function execution monitor routes.
 * Migrated from supabase/functions/function-monitor.
 *
 * POST /function-monitor/log      — log a function execution (admin)
 * GET  /function-monitor/status    — latest status per function (admin)
 * GET  /function-monitor/health    — public health summary
 * POST /function-monitor/alert     — check for failing functions (admin)
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';

const functionMonitor = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ---------------------------------------------------------------------------
// POST /function-monitor/log — Log a function execution
// ---------------------------------------------------------------------------
functionMonitor.post('/log', requireAuth as any, requireAdmin as any, async (c) => {
  const body = await c.req.json<{
    function_name: string;
    status: 'success' | 'error' | 'timeout';
    duration_ms: number;
    error?: string;
    metadata?: Record<string, unknown>;
  }>();

  const { function_name, status, duration_ms, error, metadata } = body;

  if (!function_name || !status || duration_ms === undefined) {
    return c.json({ data: null, error: 'function_name, status, and duration_ms are required' }, 400);
  }

  if (!['success', 'error', 'timeout'].includes(status)) {
    return c.json({ data: null, error: 'status must be one of: success, error, timeout' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO function_execution_logs (id, function_name, status, duration_ms, error_message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      function_name,
      status,
      duration_ms,
      error || null,
      metadata ? JSON.stringify(metadata) : null,
      now,
    )
    .run();

  return c.json({
    data: {
      id,
      function_name,
      status,
      duration_ms,
      created_at: now,
    },
    error: null,
  }, 201);
});

// ---------------------------------------------------------------------------
// GET /function-monitor/status — Latest execution per function
// ---------------------------------------------------------------------------
functionMonitor.get('/status', requireAuth as any, requireAdmin as any, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT l.*
     FROM function_execution_logs l
     INNER JOIN (
       SELECT function_name, MAX(created_at) AS max_created
       FROM function_execution_logs
       GROUP BY function_name
     ) latest ON l.function_name = latest.function_name AND l.created_at = latest.max_created
     ORDER BY l.function_name`,
  ).all();

  // Parse metadata JSON strings back to objects
  const data = (result.results || []).map((row: any) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  return c.json({ data, error: null });
});

// ---------------------------------------------------------------------------
// GET /function-monitor/health — Public health check summary
// ---------------------------------------------------------------------------
functionMonitor.get('/health', async (c) => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [lastHour, last24h] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM function_execution_logs WHERE status != 'success' AND created_at >= ?`,
    )
      .bind(oneHourAgo)
      .first<{ count: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM function_execution_logs WHERE status != 'success' AND created_at >= ?`,
    )
      .bind(twentyFourHoursAgo)
      .first<{ count: number }>(),
  ]);

  const failedLastHour = lastHour?.count ?? 0;
  const failedLast24h = last24h?.count ?? 0;

  const healthStatus = failedLastHour === 0 ? 'healthy' : failedLastHour <= 3 ? 'degraded' : 'unhealthy';

  return c.json({
    data: {
      status: healthStatus,
      failed_last_hour: failedLastHour,
      failed_last_24h: failedLast24h,
      checked_at: now.toISOString(),
    },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// POST /function-monitor/alert — Check for functions failing repeatedly
// ---------------------------------------------------------------------------
functionMonitor.post('/alert', requireAuth as any, requireAdmin as any, async (c) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const result = await c.env.DB.prepare(
    `SELECT function_name, COUNT(*) as failure_count, MAX(created_at) as last_failure, MAX(error_message) as last_error
     FROM function_execution_logs
     WHERE status != 'success' AND created_at >= ?
     GROUP BY function_name
     HAVING COUNT(*) > 3
     ORDER BY failure_count DESC`,
  )
    .bind(oneHourAgo)
    .all();

  const alerts = (result.results || []).map((row: any) => ({
    function_name: row.function_name,
    failure_count: row.failure_count,
    last_failure: row.last_failure,
    last_error: row.last_error,
    severity: row.failure_count > 10 ? 'critical' : 'warning',
  }));

  return c.json({
    data: {
      alerts,
      alert_count: alerts.length,
      checked_at: new Date().toISOString(),
    },
    error: null,
  });
});

export { functionMonitor };
