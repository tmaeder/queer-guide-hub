/**
 * BrokenList — the machine side of the feed: what is failing right now.
 *
 * Rows only exist when something is wrong; when everything is clear the whole
 * section collapses to one muted line rather than four green ticks. Nothing here
 * is a number-for-its-own-sake — every row is a thing an admin would go fix.
 */

import { Link } from 'react-router';
import { AlertTriangle, Bot, Download, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CockpitList } from '@/components/admin/cockpit/CockpitSection';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import type { CockpitOps } from '@/hooks/useCockpitOps';
import type { LucideIcon } from 'lucide-react';

function BrokenRow({
  icon: Icon,
  label,
  detail,
  count,
  route,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  count: number;
  route: string;
}) {
  return (
    <Link
      to={route}
      className="flex min-h-11 items-center justify-between gap-2 px-4 py-2 no-underline transition-colors hover:bg-muted/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-15">{label}</span>
          {detail && (
            <span className="block truncate text-2xs text-muted-foreground">{detail}</span>
          )}
        </span>
      </span>
      <Badge variant="destructive" className="shrink-0 rounded-badge text-2xs tabular-nums">
        {count}
      </Badge>
    </Link>
  );
}

export function BrokenList({
  ops,
  loading,
  error,
}: {
  ops: CockpitOps | undefined;
  loading: boolean;
  error?: boolean;
}) {
  if (loading) return <AdminTextSkeleton lines={3} />;
  // Say so rather than falling back to a reassuring "Nothing failing." — an
  // unread source is not a healthy one.
  if (error || !ops) {
    return <p className="text-13 text-destructive">Could not read system status.</p>;
  }

  if (ops.allClear) {
    return <p className="text-13 text-muted-foreground">Nothing failing.</p>;
  }

  const criticalGates = ops.failingGates.filter((g) => g.severity === 'critical').length;

  return (
    <CockpitList>
      {ops.failingGates.length > 0 && (
        <BrokenRow
          icon={Lock}
          label="Release gates failing"
          detail={
            criticalGates > 0
              ? `${criticalGates} critical · ${ops.failingGates
                  .slice(0, 2)
                  .map((g) => g.label)
                  .join(', ')}`
              : ops.failingGates
                  .slice(0, 3)
                  .map((g) => g.label)
                  .join(', ')
          }
          count={ops.failingGates.length}
          route="/admin/quality"
        />
      )}
      {ops.failingAutomations.length > 0 && (
        <BrokenRow
          icon={Bot}
          label="Automations failing"
          detail={ops.failingAutomations
            .slice(0, 3)
            .map((a) => a.name)
            .join(', ')}
          count={ops.failingAutomations.length}
          route="/admin/automation"
        />
      )}
      {ops.pipelineErrors.length > 0 && (
        <BrokenRow
          icon={AlertTriangle}
          label="Pipeline errors (24h)"
          detail={ops.pipelineErrors
            .slice(0, 3)
            .map((e) => e.functionName)
            .join(', ')}
          count={ops.pipelineErrors24h}
          route="/admin/pipelines"
        />
      )}
      {ops.failedImportsToday > 0 && (
        <BrokenRow
          icon={Download}
          label="Imports failed today"
          count={ops.failedImportsToday}
          route="/admin/imports/data"
        />
      )}
    </CockpitList>
  );
}
