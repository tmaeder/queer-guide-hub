/**
 * sync-supabase-advisors — pulls Security + Performance advisor findings from
 * the Supabase Management API and surfaces them as `api_error` rows so they
 * show up alongside runtime errors in /admin/feedback → API Errors kanban.
 *
 * Policy (the board is for actionable tickets, not the full lint backlog):
 *   - INFO: never surfaced (both types).
 *   - Performance: only ERROR. WARN (multiple_permissive_policies,
 *     auth_rls_initplan, duplicate_index, …) is optimization backlog, not a
 *     runtime error — it flooded the board, so it's dropped here.
 *   - Security ERROR: always surfaced.
 *   - Security WARN: surfaced EXCEPT a denylist of known false-positive floods
 *     for this project — our SECURITY DEFINER RPCs deliberately self-gate
 *     (requireInternalOrAdmin / has_role / RLS-aware bodies) and search_path is
 *     bulk-managed, so the advisor flags ~370 of them without any being
 *     actionable. Everything else (rls_policy_always_true, security_definer_view,
 *     auth_insufficient_mfa_options, …) still surfaces.
 *
 * Each finding uses the advisor's stable `cache_key` as the fingerprint so
 * repeat runs deduplicate. Findings that disappear between runs auto-resolve
 * (feedback_status='done', resolution='fixed'), closing the loop without a
 * manual admin click.
 *
 * Scheduled hourly via pg_cron — see the migration alongside this function.
 *
 * Required env:
 *   MANAGEMENT_ACCESS_TOKEN  Personal Access Token with project:read (the
 *                            Supabase secret store blocks the SUPABASE_
 *                            prefix for user-defined secrets, so we drop it)
 *   SUPABASE_URL             (auto — used to derive project ref)
 *   SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

interface AdvisorLint {
  name: string;
  title: string;
  level: 'ERROR' | 'WARN' | 'INFO';
  facing: string;
  categories: string[];
  description: string;
  detail: string;
  remediation: string;
  metadata: Record<string, unknown>;
  cache_key: string;
}

interface AdvisorResponse {
  lints: AdvisorLint[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function projectRefFromUrl(supabaseUrl: string): string | null {
  // https://<ref>.supabase.co → <ref>
  const m = supabaseUrl.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function fetchAdvisors(
  ref: string,
  pat: string,
  type: 'security' | 'performance',
): Promise<AdvisorLint[]> {
  const url = `https://api.supabase.com/v1/projects/${ref}/advisors/${type}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`advisors/${type} ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as AdvisorResponse;
  return body.lints ?? [];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const pat = Deno.env.get('MANAGEMENT_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!pat) return json({ error: 'MANAGEMENT_ACCESS_TOKEN not set' }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env missing' }, 500);

  const ref = projectRefFromUrl(supabaseUrl);
  if (!ref) return json({ error: 'Cannot derive project ref from SUPABASE_URL' }, 500);

  const svc = createClient(supabaseUrl, serviceKey);

  // 1. Pull advisor findings.
  let security: AdvisorLint[];
  let performance: AdvisorLint[];
  try {
    [security, performance] = await Promise.all([
      fetchAdvisors(ref, pat, 'security'),
      fetchAdvisors(ref, pat, 'performance'),
    ]);
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }

  // 2. Filter to high-signal findings only (see policy in the file header).
  //    Known false-positive security WARN floods for this project — our
  //    SECURITY DEFINER RPCs self-gate and search_path is bulk-managed.
  const SECURITY_WARN_NOISE = new Set([
    'authenticated_security_definer_function_executable',
    'anon_security_definer_function_executable',
    'function_search_path_mutable',
  ]);
  const keepLint = (l: AdvisorLint, type: 'security' | 'performance'): boolean => {
    if (l.level === 'INFO') return false;
    if (type === 'performance') return l.level === 'ERROR';
    if (l.level === 'ERROR') return true; // always surface security errors
    return !SECURITY_WARN_NOISE.has(l.name); // security WARN: drop known floods
  };
  const kept = [
    ...security.map((l) => ({ lint: l, type: 'security' as const })),
    ...performance.map((l) => ({ lint: l, type: 'performance' as const })),
  ].filter(({ lint, type }) => keepLint(lint, type));

  // 3. Upsert each finding as an api_error row.
  const liveFingerprints = new Set<string>();
  let upserted = 0;
  for (const { lint, type } of kept) {
    const fingerprint = `advisor:${lint.cache_key}`;
    liveFingerprints.add(fingerprint);

    const data = {
      service: 'supabase-advisor',
      function_name: lint.name,
      message: `[${type}/${lint.level}] ${lint.title}: ${lint.detail}`,
      status_code: null,
      endpoint: `advisor/${type}`,
      metadata: {
        source: 'supabase-advisor',
        advisor_type: type,
        severity: lint.level,
        rule: lint.name,
        title: lint.title,
        detail: lint.detail,
        remediation_url: lint.remediation,
        categories: lint.categories,
        advisor_metadata: lint.metadata,
        cache_key: lint.cache_key,
      },
      reported_at: new Date().toISOString(),
    };

    const { error } = await svc.rpc('upsert_api_error', {
      p_fingerprint: fingerprint,
      p_data: data,
      p_source: 'sync-supabase-advisors',
    });
    if (error) {
      console.error(`upsert failed for ${fingerprint}:`, error.message);
      continue;
    }
    upserted += 1;
  }

  // 4. Auto-resolve rows whose finding has been remediated (no longer in the
  //    advisor output). Only touch advisor-sourced rows — runtime api_error
  //    rows manage their own lifecycle elsewhere.
  const { data: openAdvisorRows, error: fetchErr } = await svc
    .from('community_submissions')
    .select('id,fingerprint')
    .eq('content_type', 'api_error')
    .neq('feedback_status', 'done')
    .like('fingerprint', 'advisor:%');
  if (fetchErr) {
    return json({ error: `read open advisors: ${fetchErr.message}` }, 500);
  }

  const toResolve = (openAdvisorRows ?? []).filter(
    (r) => !liveFingerprints.has(r.fingerprint as string),
  );
  let resolved = 0;
  if (toResolve.length > 0) {
    const now = new Date().toISOString();
    const { error: updErr } = await svc
      .from('community_submissions')
      .update({
        feedback_status: 'done',
        resolution: 'fixed',
        resolved_at: now,
      })
      .in(
        'id',
        toResolve.map((r) => r.id),
      );
    if (updErr) {
      return json({ error: `auto-resolve: ${updErr.message}` }, 500);
    }
    resolved = toResolve.length;
  }

  return json({
    success: true,
    scanned: {
      security: security.length,
      performance: performance.length,
      kept: kept.length,
    },
    upserted,
    auto_resolved: resolved,
  });
});
