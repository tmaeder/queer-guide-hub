/**
 * useCockpitOps — everything the cockpit's "Broken" section needs, in one
 * query key.
 *
 * The old cockpit spread these four sources across four widgets with four
 * independent query keys and six requests (import status alone fired three
 * head-counts). They are all answers to one question — "is anything broken
 * right now" — and they are all moderator+ only, so they share a key, a
 * cadence, and an `enabled` gate. An editor never issues any of them.
 *
 * Deliberately NOT ported from the old cockpit: the "System Health" widget.
 * Its DB-latency figure was the round-trip of an unrelated `venues` head-count,
 * its error count was `error ? 1 : 0`, and `lastDeployAt` was hardcoded null.
 * A fabricated green light is worse than no light.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

export interface FailingAutomation {
  slug: string;
  name: string;
  lastRunAt: string | null;
}

export interface PipelineErrorGroup {
  functionName: string;
  errors24h: number;
}

export interface FailingGate {
  label: string;
  severity: string | null;
  count: number | null;
}

export interface CockpitOps {
  failingAutomations: FailingAutomation[];
  pipelineErrors: PipelineErrorGroup[];
  pipelineErrors24h: number;
  failingGates: FailingGate[];
  failedImportsToday: number;
  /** True when every source is clear. Drives the one-line collapsed state. */
  allClear: boolean;
}

interface AutomationRow {
  slug?: string;
  name?: string;
  enabled?: boolean;
  last_run_status?: string | null;
  last_run_at?: string | null;
}

interface PipelineErrorRow {
  function_name?: string;
  errors_24h?: number;
}

/** release_gate_checks() has drifted its column names across migrations, so
 *  read it defensively rather than pinning one shape. */
interface GateRow {
  check?: string;
  label?: string;
  name?: string;
  severity?: string | null;
  status?: string | null;
  ok?: boolean | null;
  count?: number | null;
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchOps(): Promise<CockpitOps> {
  const [automations, errors, gates, imports] = await Promise.all([
    untypedFrom('admin_automations').select('slug, name, enabled, last_run_status, last_run_at'),
    untypedFrom('pipeline_error_summary').select('function_name, errors_24h').limit(100),
    untypedRpc<GateRow[]>('release_gate_checks'),
    // One select instead of the three head-counts the old Import Status widget
    // fired: today's rows are bounded, so counting client-side is cheaper.
    supabase.from('import_jobs_enhanced').select('status').gte('updated_at', startOfTodayISO()),
  ]);

  // Throw rather than fall through to empty arrays. A failed read would
  // otherwise compute allClear=true and render "Nothing failing." — a
  // fabricated green light, which is the exact defect that got the old System
  // Health widget deleted. Let it surface as an error state instead.
  const failed = [automations.error, errors.error, gates.error, imports.error].filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`cockpit ops read failed: ${failed.map((e) => e!.message).join('; ')}`);
  }

  const failingAutomations = ((automations.data ?? []) as AutomationRow[])
    .filter((a) => a.enabled && a.last_run_status === 'failed')
    .map((a) => ({
      slug: a.slug ?? '',
      name: a.name ?? a.slug ?? 'Unnamed automation',
      lastRunAt: a.last_run_at ?? null,
    }));

  const pipelineErrors = ((errors.data ?? []) as PipelineErrorRow[])
    .map((e) => ({ functionName: e.function_name ?? 'unknown', errors24h: e.errors_24h ?? 0 }))
    .filter((e) => e.errors24h > 0)
    .sort((a, b) => b.errors24h - a.errors24h);

  const failingGates = ((gates.data ?? []) as GateRow[])
    .filter((g) => g.ok === false || g.status === 'fail' || (g.count ?? 0) > 0)
    .map((g) => ({
      label: g.label ?? g.check ?? g.name ?? 'Unnamed gate',
      severity: g.severity ?? null,
      count: g.count ?? null,
    }));

  const failedImportsToday = ((imports.data ?? []) as Array<{ status?: string }>).filter(
    (j) => j.status === 'failed',
  ).length;

  return {
    failingAutomations,
    pipelineErrors,
    pipelineErrors24h: pipelineErrors.reduce((sum, e) => sum + e.errors24h, 0),
    failingGates,
    failedImportsToday,
    allClear:
      failingAutomations.length === 0 &&
      pipelineErrors.length === 0 &&
      failingGates.length === 0 &&
      failedImportsToday === 0,
  };
}

export function useCockpitOps(enabled: boolean) {
  return useQuery({
    queryKey: ['cockpit', 'ops'],
    queryFn: fetchOps,
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
