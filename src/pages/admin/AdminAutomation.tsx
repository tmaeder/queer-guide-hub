/**
 * AdminAutomation — registry of admin_automations + recent runs.
 * v0: read-only listing. Visual rule builder lands in a follow-up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
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
  Search,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatNextFire } from '@/lib/nextCronFire';
import { toast } from 'sonner';
import { AdminRegistryFrame } from '@/components/admin/frames/AdminRegistryFrame';
import { AdminSimpleTable } from '@/components/admin/primitives/AdminSimpleTable';
import { Input } from '@/components/ui/input';
import {
  automationCounts,
  automationDomain,
  automationStatusLabel,
  filterAutomations,
  type AutomationView,
} from '@/lib/adminAutomationFilters';

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
  consecutive_failures: number;
  consecutive_partials: number;
  auto_pause_threshold: number;
  created_at: string;
  updated_at: string;
  lifecycle_state: 'active' | 'paused' | 'auto_paused' | 'completed' | 'retired' | 'consolidated';
  can_run_now: boolean;
  can_dry_run: boolean;
  capability_reason: string | null;
}

interface MaintenanceState {
  active: boolean;
  generation: string | null;
  entered_at: string | null;
  entered_by: string | null;
  snapshot_count: number;
}

interface DryRunAllSummary {
  eligible: number;
  skipped: number;
  succeeded: number;
  failed: number;
  total_would_change: number;
}

interface AutomationRun {
  id: number;
  automation_slug: string;
  started_at: string;
  finished_at: string | null;
  // 'running' is the open state of an async cron dispatch: the row is written
  // when the request is issued and finalized by admin_automation_reap_runs
  // once net._http_response has an answer for it.
  status: 'success' | 'partial' | 'error' | 'dry_run' | 'running';
  items_examined: number;
  items_changed: number;
  summary: Record<string, unknown> | null;
  error: string | null;
}

async function fetchAutomations(): Promise<Automation[]> {
  const { data, error } = await untypedFrom('admin_automations')
    .select('*')
    .order('managed_by', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Automation[];
}

async function fetchRecentRuns(slugFilter: string | null): Promise<AutomationRun[]> {
  let q = untypedFrom('admin_automation_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  if (slugFilter) q = q.eq('automation_slug', slugFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AutomationRun[];
}

async function fetchMaintenanceState(): Promise<MaintenanceState> {
  const { data, error } = await untypedRpc<MaintenanceState>('admin_automation_maintenance_state');
  if (error) throw new Error(error.message);
  return data as unknown as MaintenanceState;
}

function StatusIcon({ status }: { status: AutomationRun['status'] }) {
  const icon =
    status === 'success' ? (
      <CheckCircle2 size={14} className="text-foreground" />
    ) : status === 'error' ? (
      <XCircle size={14} className="text-destructive" />
    ) : status === 'dry_run' ? (
      <FlaskConical size={14} className="text-muted-foreground" />
    ) : status === 'running' ? (
      <Clock size={14} className="text-muted-foreground" />
    ) : (
      <AlertCircle size={14} className="text-muted-foreground" />
    );
  return (
    <span className="inline-flex items-center gap-1" title={status}>
      {icon}
      <span className="sr-only">{status}</span>
    </span>
  );
}

export default function AdminAutomation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAdminRoles();
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [registryView, setRegistryView] = useState<AutomationView>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [dryRunSummary, setDryRunSummary] = useState<DryRunAllSummary | null>(null);
  const choseInitialView = useRef(false);

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
  const maintenanceQ = useQuery({
    queryKey: ['admin-automation-maintenance'],
    queryFn: fetchMaintenanceState,
  });
  const runsQ = useQuery({
    queryKey: ['admin-automation-runs', filterSlug],
    queryFn: () => fetchRecentRuns(filterSlug),
    refetchInterval: 30_000,
  });

  const detailRow = detailSlug
    ? (automationsQ.data?.find((a) => a.slug === detailSlug) ?? null)
    : null;

  const automations = useMemo(() => automationsQ.data ?? [], [automationsQ.data]);
  const counts = useMemo(() => automationCounts(automations), [automations]);
  const dryRunEligible = useMemo(
    () =>
      automations.filter((a) => a.enabled && a.lifecycle_state === 'active' && a.can_dry_run)
        .length,
    [automations],
  );
  const domains = useMemo(
    () => Array.from(new Set(automations.map((a) => automationDomain(a.slug)))).sort(),
    [automations],
  );
  const visibleAutomations = useMemo(
    () =>
      filterAutomations(automations, {
        view: registryView,
        query: searchQuery,
        domain: domainFilter,
        owner: ownerFilter,
      }),
    [automations, registryView, searchQuery, domainFilter, ownerFilter],
  );

  useEffect(() => {
    if (!automationsQ.isLoading && !choseInitialView.current) {
      choseInitialView.current = true;
      if (counts.attention > 0) setRegistryView('attention');
    }
  }, [automationsQ.isLoading, counts.attention]);

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

  async function setMaintenance(active: boolean) {
    const message = active
      ? `Enter maintenance mode? The ${maintenanceQ.data?.snapshot_count ?? counts.active} currently active automations will be snapshotted and paused.`
      : `Exit maintenance mode? Only the ${maintenanceQ.data?.snapshot_count ?? 0} automations captured on entry will be restored.`;
    if (!window.confirm(message)) return;
    setBusySlug(`maintenance:${active}`);
    try {
      const { data, error } = await untypedRpc<{ changed: number }>(
        'admin_automation_set_maintenance',
        {
          p_active: active,
        },
      );
      if (error) throw new Error(error.message);
      const n = data?.changed ?? 0;
      toast.success(
        active
          ? `Maintenance mode active · paused ${n} automation${n === 1 ? '' : 's'}`
          : `Maintenance mode ended · restored ${n} automation${n === 1 ? '' : 's'}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Maintenance-mode change failed');
    } finally {
      setBusySlug(null);
      qc.invalidateQueries({ queryKey: ['admin-automations'] });
      qc.invalidateQueries({ queryKey: ['admin-automation-maintenance'] });
    }
  }

  useRegisterAdminCommandAction(
    isAdmin && !maintenanceQ.data?.active
      ? {
          id: 'automation.pause-all',
          label: 'Enter automation maintenance mode',
          keywords: 'emergency kill switch stop',
          perform: () => setMaintenance(true),
        }
      : null,
  );
  useRegisterAdminCommandAction(
    isAdmin && maintenanceQ.data?.active
      ? {
          id: 'automation.resume-all',
          label: 'Exit automation maintenance mode',
          keywords: 'enable restart',
          perform: () => setMaintenance(false),
        }
      : null,
  );

  async function dryRunAll() {
    setBusySlug('dry-all');
    try {
      const { data, error } = await supabase.rpc('admin_automation_dry_run_all');
      if (error) throw error;
      const d = data as {
        eligible: number;
        skipped: number;
        succeeded: number;
        failed: number;
        total_would_change: number;
        per_slug: Record<string, { would_change?: number; error?: string }>;
      };
      setDryRunSummary(d);
      toast.success(`Dry-run complete · ${d.succeeded}/${d.eligible} previews succeeded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dry-run all failed');
    } finally {
      setBusySlug(null);
      qc.invalidateQueries({ queryKey: ['admin-automation-runs'] });
    }
  }

  useRegisterAdminCommandAction(
    dryRunEligible > 0 && !maintenanceQ.data?.active
      ? {
          id: 'automation.dry-run-all',
          label: `Dry-run ${dryRunEligible} eligible automations`,
          keywords: 'preview simulate everything',
          perform: () => dryRunAll(),
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
    /* Archetype H — the reference implementation. A slug, an enabled toggle, a
       last-run status and a next-fire time is the archetype's definition almost
       word for word.

       The seven-column TABLE is kept deliberately. H constrains the grammar —
       header, filter row, primary action, a body of named things with their
       state — not the markup, and a schedule and a next-fire time are exactly
       what an operator scans down a column. Flattening this into the frame's
       simple row shape would have been a downgrade dressed as consistency; it
       is why AdminRegistryFrame takes a body rather than a row list.

       The subtitle is gone: the route line now carries the "where am I" job,
       and the shell has stopped drawing its breadcrumb band above this page
       (see `adopted` in adminArchetypes.ts). */
    <AdminRegistryFrame
      title={
        <span className="flex items-center gap-2">
          <Workflow size={22} aria-hidden />
          Automation
        </span>
      }
      actions={
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={dryRunAll}
            disabled={busySlug !== null || dryRunEligible === 0 || maintenanceQ.data?.active}
            title={
              dryRunEligible > 0
                ? `Preview ${dryRunEligible} eligible automation${dryRunEligible === 1 ? '' : 's'}`
                : 'No enabled automations have a truthful dry-run'
            }
          >
            {busySlug === 'dry-all' ? (
              <TrackLoader size={12} className="mr-1" />
            ) : (
              <FlaskConical size={12} className="mr-1" />
            )}
            Dry-run eligible ({dryRunEligible})
          </Button>
          {isAdmin && (
            <Button
              variant={maintenanceQ.data?.active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMaintenance(!maintenanceQ.data?.active)}
              disabled={busySlug !== null || maintenanceQ.isLoading}
              title={
                maintenanceQ.data?.active
                  ? 'Restore only the automations captured when maintenance began'
                  : 'Snapshot and pause currently active automations'
              }
            >
              {busySlug?.startsWith('maintenance:') ? (
                <TrackLoader size={12} className="mr-1" />
              ) : (
                <ShieldAlert size={12} className="mr-1" />
              )}
              {maintenanceQ.data?.active ? 'Exit maintenance' : 'Enter maintenance'}
            </Button>
          )}
        </div>
      }
    >
      {maintenanceQ.data?.active && (
        <section className="mb-4 border border-destructive/40 bg-destructive/5 p-4" role="status">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert size={16} aria-hidden />
            Automation maintenance mode is active
          </div>
          <p className="mt-1 text-13 text-muted-foreground">
            {maintenanceQ.data.snapshot_count} previously active automation
            {maintenanceQ.data.snapshot_count === 1 ? '' : 's'} will be eligible for exact
            restoration. Jobs that were already paused or have become terminal will stay paused.
          </p>
        </section>
      )}

      {(automationsQ.isError || runsQ.isError || maintenanceQ.isError) && (
        <section className="mb-4 border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertCircle size={16} aria-hidden />
            Automation data could not be loaded completely
          </div>
          <p className="mt-1 text-13 text-muted-foreground">
            Refresh before making operational changes.{' '}
            {[automationsQ.error, runsQ.error, maintenanceQ.error]
              .filter(Boolean)
              .map((error) => (error instanceof Error ? error.message : String(error)))
              .join(' · ')}
          </p>
        </section>
      )}

      {dryRunSummary && (
        <section className="mb-4 border border-border bg-muted/30 p-4" role="status">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">Dry-run summary</div>
              <p className="mt-1 text-13 text-muted-foreground">
                {dryRunSummary.succeeded} succeeded · {dryRunSummary.failed} failed ·{' '}
                {dryRunSummary.skipped} unsupported · {dryRunSummary.total_would_change} items would
                change
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDryRunSummary(null)}>
              Dismiss
            </Button>
          </div>
        </section>
      )}

      {/* Registry */}
      <section>
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-title font-semibold">Registered automations</h2>
            <p className="text-2xs text-muted-foreground tabular-nums">
              {counts.active} active · {counts.attention} attention · {counts.paused} paused ·{' '}
              {counts.terminal} terminal · {counts.total} total
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap" aria-label="Automation filters">
            {(
              [
                ['active', `Active ${counts.active}`],
                ['attention', `Attention ${counts.attention}`],
                ['paused', `Paused ${counts.paused}`],
                ['all', `All ${counts.total}`],
              ] as Array<[AutomationView, string]>
            ).map(([view, label]) => (
              <Button
                key={view}
                type="button"
                size="sm"
                variant={registryView === view ? 'secondary' : 'ghost'}
                onClick={() => setRegistryView(view)}
                aria-pressed={registryView === view}
              >
                {label}
              </Button>
            ))}
            {counts.autoPaused > 0 && (
              <Badge variant="destructive">{counts.autoPaused} auto-paused</Badge>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_150px]">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label className="sr-only" htmlFor="automation-search">
                Search automations
              </label>
              <Input
                id="automation-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search automations"
                className="pl-8"
              />
            </div>
            <select
              value={domainFilter}
              onChange={(event) => setDomainFilter(event.target.value)}
              className="h-10 rounded-element border border-input bg-background px-2 text-sm"
              aria-label="Filter by domain"
            >
              <option value="all">All domains</option>
              {domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="h-10 rounded-element border border-input bg-background px-2 text-sm"
              aria-label="Filter by owner"
            >
              <option value="all">All owners</option>
              <option value="system">System</option>
              <option value="user">User</option>
            </select>
          </div>
          <p className="text-2xs text-muted-foreground">
            Showing {visibleAutomations.length} of {counts.total}. Completed, retired, and
            consolidated jobs remain available in All for audit history.
          </p>
        </div>
        <AdminSimpleTable
          caption="Automation registry"
          rows={visibleAutomations}
          rowKey={(a) => a.id}
          isLoading={automationsQ.isLoading}
          emptyNoun="automations"
          onRowClick={(a) => setDetailSlug(a.slug)}
          rowClassName={(a) => `hover:bg-muted/40 ${detailSlug === a.slug ? 'bg-muted/60' : ''}`}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (a) => (
                <>
                  <div className="font-semibold">{a.name}</div>
                  <div className="font-mono text-2xs text-muted-foreground mt-0.5">{a.slug}</div>
                  {a.description && (
                    <div className="text-2xs text-muted-foreground mt-0.5">{a.description}</div>
                  )}
                </>
              ),
            },
            {
              key: 'managed_by',
              header: 'Control source',
              render: (a) => (
                <Badge variant={a.managed_by === 'system' ? 'secondary' : 'outline'}>
                  {a.managed_by}
                </Badge>
              ),
            },
            {
              key: 'schedule',
              header: 'Schedule',
              cellClassName: 'font-mono text-2xs',
              render: (a) => a.schedule ?? '—',
            },
            {
              key: 'next_run',
              header: 'Next run',
              cellClassName: 'text-2xs text-muted-foreground tabular-nums',
              render: (a) => (a.enabled ? formatNextFire(a.schedule) : '—'),
            },
            {
              key: 'last_run',
              header: 'Last run',
              render: (a) =>
                a.last_run_at
                  ? formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })
                  : 'Never',
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => {
                const terminal = ['completed', 'retired', 'consolidated'].includes(
                  a.lifecycle_state,
                );
                const needsAttention =
                  a.enabled && (a.consecutive_failures > 0 || a.last_run_status === 'partial');
                const label = automationStatusLabel(a);
                if (terminal) {
                  return (
                    <Badge variant="secondary" className="font-normal capitalize">
                      {label}
                    </Badge>
                  );
                }
                return isAdmin ? (
                  <Button
                    variant={needsAttention ? 'destructive' : a.enabled ? 'outline' : 'secondary'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEnabled(a.slug, !a.enabled);
                    }}
                    disabled={busySlug !== null || maintenanceQ.data?.active}
                    className="font-normal h-6 text-2xs"
                    title={
                      maintenanceQ.data?.active
                        ? 'Individual state changes are locked during maintenance mode'
                        : a.enabled
                          ? 'Pause this automation'
                          : 'Enable this automation'
                    }
                  >
                    {busySlug === `toggle:${a.slug}` ? (
                      <TrackLoader size={11} className="mr-1" />
                    ) : null}
                    {label}
                  </Button>
                ) : a.enabled ? (
                  <Badge
                    variant={needsAttention ? 'destructive' : 'outline'}
                    className="font-normal"
                  >
                    {label}
                  </Badge>
                ) : a.lifecycle_state === 'auto_paused' || a.last_run_status === 'auto_paused' ? (
                  <Badge variant="destructive" className="font-normal">
                    auto-paused
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    paused
                  </Badge>
                );
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cellClassName: 'whitespace-nowrap',
              render: (a) => (
                <>
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
                  {a.can_dry_run && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        dryRun(a.slug);
                      }}
                      disabled={busySlug !== null || maintenanceQ.data?.active}
                      title="Preview without mutating"
                      className="ml-2"
                    >
                      {busySlug === `dry:${a.slug}` ? (
                        <TrackLoader size={12} className="mr-1" />
                      ) : (
                        <FlaskConical size={12} className="mr-1" />
                      )}
                      Dry-run
                    </Button>
                  )}
                  {isAdmin && a.can_run_now && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        runNow(a.slug);
                      }}
                      disabled={busySlug !== null || !a.enabled || maintenanceQ.data?.active}
                      className="ml-2"
                      title={
                        maintenanceQ.data?.active
                          ? 'Manual runs are locked during maintenance mode'
                          : a.enabled
                            ? 'Run now'
                            : 'Enable to run'
                      }
                    >
                      {busySlug === `run:${a.slug}` ? (
                        <TrackLoader size={12} className="mr-1" />
                      ) : (
                        <Play size={12} className="mr-1" />
                      )}
                      Run now
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      </section>

      {/* Recent runs */}
      <section>
        <div className="flex items-center justify-between mb-2">
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
        <AdminSimpleTable
          caption="Recent automation runs"
          rows={runsQ.data ?? []}
          rowKey={(r) => String(r.id)}
          isLoading={runsQ.isLoading}
          emptyNoun="runs"
          skeletonRows={6}
          columns={[
            {
              key: 'status',
              header: <span className="sr-only">Status</span>,
              width: 'xs',
              cellClassName: 'align-top',
              render: (r) => <StatusIcon status={r.status} />,
            },
            {
              key: 'automation',
              header: 'Automation',
              cellClassName: 'align-top font-mono text-2xs',
              render: (r) => r.automation_slug,
            },
            {
              key: 'started',
              header: 'Started',
              cellClassName: 'align-top',
              render: (r) => formatDistanceToNow(new Date(r.started_at), { addSuffix: true }),
            },
            {
              key: 'examined',
              header: 'Examined',
              align: 'right',
              cellClassName: 'align-top tabular-nums',
              render: (r) => r.items_examined,
            },
            {
              key: 'changed',
              header: 'Changed',
              align: 'right',
              cellClassName: 'align-top tabular-nums font-semibold',
              render: (r) => r.items_changed,
            },
            {
              key: 'notes',
              header: 'Notes',
              cellClassName: 'align-top text-2xs text-muted-foreground',
              render: (r) =>
                r.error ? (
                  <span className="text-destructive">{r.error}</span>
                ) : r.summary?.rule ? (
                  String(r.summary.rule)
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </section>

      {/* Detail drawer */}
      <Sheet open={!!detailRow} onOpenChange={(o) => !o && setDetailSlug(null)}>
        <SheetContent side="right" className="w-full sm:w-[520px] p-6 overflow-auto">
          {detailRow && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="text-headline">{detailRow.name}</SheetTitle>
                <SheetDescription className="font-mono text-2xs">{detailRow.slug}</SheetDescription>
              </SheetHeader>

              {detailRow.description && (
                <p className="text-13 text-muted-foreground mb-4">{detailRow.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-13 mb-6">
                <dt className="text-muted-foreground">Control source</dt>
                <dd>{detailRow.managed_by}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{detailRow.lifecycle_state.replace('_', ' ')}</dd>
                <dt className="text-muted-foreground">Schedule</dt>
                <dd className="font-mono text-2xs">{detailRow.schedule ?? '—'}</dd>
                <dt className="text-muted-foreground">Next run</dt>
                <dd>{detailRow.enabled ? formatNextFire(detailRow.schedule) : 'paused'}</dd>
                <dt className="text-muted-foreground">Last run</dt>
                <dd>
                  {detailRow.last_run_at
                    ? formatDistanceToNow(new Date(detailRow.last_run_at), { addSuffix: true })
                    : 'Never'}
                </dd>
                <dt className="text-muted-foreground">Last status</dt>
                <dd>{detailRow.last_run_status ?? '—'}</dd>
                <dt className="text-muted-foreground">Consecutive failures</dt>
                <dd
                  className={
                    detailRow.consecutive_failures > 0 ? 'text-destructive font-semibold' : ''
                  }
                >
                  {detailRow.consecutive_failures} / {detailRow.auto_pause_threshold} before
                  auto-pause
                </dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDistanceToNow(new Date(detailRow.created_at), { addSuffix: true })}</dd>
                <dt className="text-muted-foreground">Manual run</dt>
                <dd>{detailRow.can_run_now ? 'Supported' : 'Unavailable'}</dd>
                <dt className="text-muted-foreground">Dry-run</dt>
                <dd>{detailRow.can_dry_run ? 'Supported' : 'Unavailable'}</dd>
              </dl>

              {detailRow.capability_reason && (
                <div className="mb-4 border border-border bg-muted/30 p-4 text-13">
                  <span className="font-semibold">Manual capability:</span>{' '}
                  <span className="text-muted-foreground">{detailRow.capability_reason}</span>
                </div>
              )}

              <h3 className="text-title font-semibold mb-2">Trigger</h3>
              <pre className="p-4 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
                {JSON.stringify(detailRow.trigger, null, 2)}
              </pre>

              <h3 className="text-title font-semibold mb-2">Conditions</h3>
              <pre className="p-4 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
                {JSON.stringify(detailRow.conditions, null, 2)}
              </pre>

              <h3 className="text-title font-semibold mb-2">Action</h3>
              <pre className="p-4 bg-muted border border-border text-2xs font-mono mb-4 overflow-auto">
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
                {detailRow.can_dry_run && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dryRun(detailRow.slug)}
                    disabled={busySlug !== null || maintenanceQ.data?.active}
                  >
                    <FlaskConical size={12} className="mr-1" />
                    Dry-run
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminRegistryFrame>
  );
}
