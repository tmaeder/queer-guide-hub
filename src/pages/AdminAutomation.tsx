/**
 * AdminAutomation — registry of admin_automations + recent runs.
 * v0: read-only listing. Visual rule builder lands in a follow-up.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Workflow, Play, CheckCircle2, XCircle, Clock, AlertCircle, FlaskConical, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
      <header>
        <h1 className="text-headline font-bold flex items-center gap-2">
          <Workflow size={22} />
          Automation
        </h1>
        <p className="text-13 text-muted-foreground mt-1">
          Things the system is doing on its own. Each row is a rule; runs are audited below.
        </p>
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
                    className={`border-t border-border cursor-pointer hover:bg-muted/40 ${filterSlug === a.slug ? 'bg-muted/60' : ''}`}
                    onClick={() => setFilterSlug(filterSlug === a.slug ? null : a.slug)}
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
                          onClick={(e) => { e.stopPropagation(); toggleEnabled(a.slug, !a.enabled); }}
                          disabled={busySlug !== null}
                          className="font-normal h-6 text-2xs"
                        >
                          {busySlug === `toggle:${a.slug}` ? (
                            <Loader2 size={11} className="mr-1 animate-spin" />
                          ) : null}
                          {a.enabled ? 'enabled · click to pause' : 'paused · click to enable'}
                        </Button>
                      ) : a.enabled ? (
                        <Badge variant="outline" className="font-normal">enabled</Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal">paused</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); dryRun(a.slug); }}
                        disabled={busySlug !== null}
                        title="Preview without mutating"
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
                          onClick={(e) => { e.stopPropagation(); runNow(a.slug); }}
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
              <span className="text-13 font-mono text-muted-foreground">
                · {filterSlug}
              </span>
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
            Click any automation row above to filter this list.
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
                    <td className="px-4 py-2 align-top font-mono text-2xs">{r.automation_slug}</td>
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
    </div>
  );
}
