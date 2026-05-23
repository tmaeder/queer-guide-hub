/**
 * AdminAutomation — registry of admin_automations + recent runs.
 * v0: read-only listing. Visual rule builder lands in a follow-up.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Workflow,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FlaskConical,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useRegisterAdminCommandAction } from '@/components/admin/command-palette/useAdminCommandActions';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { adminAction } from '@/lib/adminAction';
import { toast } from 'sonner';

interface Automation {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  managed_by: 'user' | 'system';
  enabled: boolean;
  schedule: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  trigger: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  action: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AutomationRun {
  id: number;
  automation_slug: string;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'partial' | 'error' | 'dry_run';
  items_examined: number;
  items_changed: number;
  summary: Record<string, unknown> | null;
  error: string | null;
}

async function fetchAutomations(): Promise<Automation[]> {
  const { data, error } = await supabase
    .from('admin_automations' as never)
    .select('*')
    .order('managed_by', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Automation[];
}

async function fetchRecentRuns(slugFilter: string | null): Promise<AutomationRun[]> {
  let q = supabase
    .from('admin_automation_runs' as never)
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  if (slugFilter) q = q.eq('automation_slug', slugFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AutomationRun[];
}

function StatusIcon({ status }: { status: AutomationRun['status'] }) {
  if (status === 'success') return <CheckCircle2 size={14} className="text-foreground" />;
  if (status === 'error') return <XCircle size={14} className="text-destructive" />;
  if (status === 'dry_run') return <Clock size={14} className="text-muted-foreground" />;
  return <AlertCircle size={14} className="text-muted-foreground" />;
}

export default function AdminAutomation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAdminRoles();
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  useRegisterAdminCommandAction({
    id: 'automation.view',
    label: 'Go to Automation',
    keywords: 'rules automation cron',
    perform: () => navigate('/admin/automation'),
  });

  useEffect(() => {
    document.title = 'Automation · Admin · Queer Guide';
  }, []);

  const automationsQ = useQuery({ queryKey: ['admin-automations'], queryFn: fetchAutomations });
  const runsQ = useQuery({
    queryKey: ['admin-automation-runs', filterSlug],
    queryFn: () => fetchRecentRuns(filterSlug),
    refetchInterval: 30_000,
  });

  const detailRow = detailSlug
    ? automationsQ.data?.find((a) => a.slug === detailSlug) ?? null
    : null;

  async function runNow(slug: string) {
    setBusySlug(`run:${slug}`);
    await adminAction({
      label: `Run ${slug}`,
      perform: async () => {
        const { data, error } = await supabase.rpc('admin_automation_run', { p_slug: slug });
        if (error) throw error;
        return data;
      },
      successMessage: `Ran ${slug}`,
    });
    setBusySlug(null);
    qc.invalidateQueries({ queryKey: ['admin-automation-runs'] });
    qc.invalidateQueries({ queryKey: ['admin-automations'] });
  }

  async function toggleEnabled(slug: string, next: boolean) {
    setBusySlug(`toggle:${slug}`);
    try {
      const { error } = await supabase.rpc('admin_automation_set_enabled', {
        p_slug: slug,
        p_enabled: next,
      });
      if (error) throw error;
      toast.success(next ? `Enabled ${slug}` : `Paused ${slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setBusySlug(null);
      qc.invalidateQueries({ queryKey: ['admin-automations'] });
    }
  }

  async function pauseAll(enabled: boolean) {
    const verb = enabled ? 'Resume' : 'Pause';
    if (!window.confirm(`${verb} ALL automations? This affects every cron job.`)) return;
    setBusySlug(`pause-all:${enabled}`);
    try {
      const { data, error } = await supabase.rpc('admin_automation_pause_all', {
        p_enabled: enabled,
      });
      if (error) throw error;
      const n = (data as { changed: number })?.changed ?? 0;
      toast.success(`${verb}d ${n} automation${n === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusySlug(null);
      qc.invalidateQueries({ queryKey: ['admin-automations'] });
    }
  }

  useRegisterAdminCommandAction(
    isAdmin
      ? {
          id: 'automation.pause-all',
          label: 'Pause all automations',
          keywords: 'emergency kill switch stop',
          perform: () => pauseAll(false),
        }
      : null,
  );
  useRegisterAdminCommandAction(
    isAdmin
      ? {
          id: 'automation.resume-all',
          label: 'Resume all automations',
          keywords: 'enable restart',
          perform: () => pauseAll(true),
        }
      : null,
  );

  async function dryRun(slug: string) {
    setBusySlug(`dry:${slug}`);
    try {
      const { data, error } = await supabase.rpc('admin_automation_dry_run', { p_slug: slug });
      if (error) throw error;
      const would = (data as { would_change: number })?.would_change ?? 0;
      toast(`Dry-run: would change ${would} item${would === 1 ? '' : 's'}`, {
        description: slug,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dry-run failed');
    } finally {
      setBusySlug(null);
      qc.invalidateQueries({ queryKey: ['admin-automation-runs'] });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-headline font-bold flex items-center gap-2">
            <Workflow size={22} />
            Automation
          </h1>
          <p className="text-13 text-muted-foreground mt-1">
            Things the system is doing on its own. Each row is a rule; runs are audited below.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pauseAll(false)}
              disabled={busySlug !== null}
              title="Disable every automation (emergency kill switch)"
            >
              {busySlug === 'pause-all:false' ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : null}
              Pause all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pauseAll(true)}
              disabled={busySlug !== null}
            >
              {busySlug === 'pause-all:true' ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : null}
              Resume all
            </Button>
          </div>
        )}
      </header>

      {/* Registry */}
      <section>
        <h2 className="text-title font-semibold mb-3">Registered automations</h2>
        {automationsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : automationsQ.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No automations registered.</p>
        ) : (
          <div className="border border-border">
            <table className="w-full text-13">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Managed by</th>
                  <th className="px-4 py-2 font-semibold">Schedule</th>
                  <th className="px-4 py-2 font-semibold">Last run</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {automationsQ.data?.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-t border-border cursor-pointer hover:bg-muted/40 ${detailSlug === a.slug ? 'bg-muted/60' : ''}`}
                    onClick={() => setDetailSlug(a.slug)}
                  >
                    <td className="px-4 py-2">
                      <div className="font-semibold">{a.name}</div>
                      <div className="font-mono text-2xs text-muted-foreground mt-0.5">{a.slug}</div>
                      {a.description && (
                        <div className="text-2xs text-muted-foreground mt-0.5">{a.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={a.managed_by === 'system' ? 'secondary' : 'outline'}>
                        {a.managed_by}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-2xs">{a.schedule ?? '—'}</td>
                    <td className="px-4 py-2">
                      {a.last_run_at
                        ? formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <Button
                          variant={a.enabled ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEnabled(a.slug, !a.enabled);
                          }}
                          disabled={busySlug !== null}
                          className="font-normal h-6 text-2xs"
                        >
                          {busySlug === `toggle:${a.slug}` ? (
                            <Loader2 size={11} className="mr-1 animate-spin" />
                          ) : null}
                          {a.enabled ? 'enabled · click to pause' : 'paused · click to enable'}
                        </Button>
                      ) : a.enabled ? (
                        <Badge variant="outline" className="font-normal">
                          enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal">
                          paused
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilterSlug(filterSlug === a.slug ? null : a.slug);
                        }}
                        title="Filter runs to this rule"
                      >
                        {filterSlug === a.slug ? 'Clear filter' : 'Filter runs'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          dryRun(a.slug);
                        }}
                        disabled={busySlug !== null}
                        title="Preview without mutating"
                        className="ml-2"
                      >
                        {busySlug === `dry:${a.slug}` ? (
                          <Loader2 size={12} className="mr-1 animate-spin" />
                        ) : (
                          <FlaskConical size={12} className="mr-1" />
                        )}
                        Dry-run
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            runNow(a.slug);
                          }}
                          disabled={busySlug !== null || !a.enabled}
                          className="ml-2"
                          title={a.enabled ? 'Run now' : 'Enable to run'}
                        >
                          {busySlug === `run:${a.slug}` ? (
                            <Loader2 size={12} className="mr-1 animate-spin" />
                          ) : (
                            <Play size={12} className="mr-1" />
                          )}
                          Run now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-title font-semibold flex items-center gap-2">
            <Play size={16} />
            Recent runs
            {filterSlug && (
              <span className="text-13 font-mono text-muted-foreground">· {filterSlug}</span>
            )}
          </h2>
          {filterSlug && (
            <Button variant="ghost" size="sm" onClick={() => setFilterSlug(null)}>
              Clear filter
            </Button>
          )}
        </div>
        {!filterSlug && (
          <p className="text-2xs text-muted-foreground -mt-2 mb-2">
            Use "Filter runs" on any automation row above to drill into its history.
          </p>
        )}
        {runsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : runsQ.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="border border-border">
            <table className="w-full text-13">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold w-8" aria-label="Status" />
                  <th className="px-4 py-2 font-semibold">Automation</th>
                  <th className="px-4 py-2 font-semibold">Started</th>
                  <th className="px-4 py-2 font-semibold text-right">Examined</th>
                  <th className="px-4 py-2 font-semibold text-right">Changed</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {runsQ.data?.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 align-top">
                      <StatusIcon status={r.status} />
                    </td>
                    <td className="px-4 py-2 align-top font-mono text-2xs">
                      {r.automation_slug}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2 align-top text-right tabular-nums">
                      {r.items_examined}
                    </td>
                    <td className="px-4 py-2 align-top text-right tabular-nums font-semibold">
                      {r.items_changed}
                    </td>
                    <td className="px-4 py-2 align-top text-2xs text-muted-foreground">
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : r.summary?.rule ? (
                        String(r.summary.rule)
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detail drawer */}
      <Sheet open={!!detailRow} onOpenChange={(o) => !o && setDetailSlug(null)}>
        <SheetContent side="right" className="w-full sm:w-[520px] p-6 overflow-auto">
          {detailRow && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="text-headline">{detailRow.name}</SheetTitle>
                <SheetDescription className="font-mono text-2xs">
                  {detailRow.slug}
                </SheetDescription>
              </SheetHeader>

              {detailRow.description && (
                <p className="text-13 text-muted-foreground mb-4">{detailRow.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-13 mb-6">
                <dt className="text-muted-foreground">Managed by</dt>
                <dd>{detailRow.managed_by}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{detailRow.enabled ? 'enabled' : 'paused'}</dd>
                <dt className="text-muted-foreground">Schedule</dt>
                <dd className="font-mono text-2xs">{detailRow.schedule ?? '—'}</dd>
                <dt className="text-muted-foreground">Last run</dt>
                <dd>
                  {detailRow.last_run_at
                    ? formatDistanceToNow(new Date(detailRow.last_run_at), { addSuffix: true })
                    : 'Never'}
                </dd>
                <dt className="text-muted-foreground">Last status</dt>
                <dd>{detailRow.last_run_status ?? '—'}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>
                  {formatDistanceToNow(new Date(detailRow.created_at), { addSuffix: true })}
                </dd>
              </dl>

              <h3 className="text-title font-semibold mb-2">Trigger</h3>
              <pre className="p-3 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
                {JSON.stringify(detailRow.trigger, null, 2)}
              </pre>

              <h3 className="text-title font-semibold mb-2">Conditions</h3>
              <pre className="p-3 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
                {JSON.stringify(detailRow.conditions, null, 2)}
              </pre>

              <h3 className="text-title font-semibold mb-2">Action</h3>
              <pre className="p-3 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
                {JSON.stringify(detailRow.action, null, 2)}
              </pre>

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterSlug(detailRow.slug);
                    setDetailSlug(null);
                  }}
                >
                  Show runs only
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dryRun(detailRow.slug)}
                  disabled={busySlug !== null}
                >
                  <FlaskConical size={12} className="mr-1" />
                  Dry-run
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
