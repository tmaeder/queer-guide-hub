/**
 * RunHistoryTable — Displays automation_run_log entries.
 */

import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import type { AutomationRunLog, AutomationModule } from '@/hooks/useAutomation';
import { format, formatDistanceToNow } from 'date-fns';

interface Props {
  runs: AutomationRunLog[];
  modules: AutomationModule[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function RunHistoryTable({ runs, modules }: Props) {
  const moduleMap = useMemo(() => {
    const map = new Map<string, AutomationModule>();
    for (const m of modules) map.set(m.id, m);
    return map;
  }, [modules]);

  if (runs.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
        <h6 className="text-base font-semibold text-muted-foreground">
          No run history yet
        </h6>
        <p className="text-sm text-muted-foreground">
          Run a module to see execution logs here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Module</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="text-right">Scanned</TableHead>
            <TableHead className="text-right">Proposed</TableHead>
            <TableHead className="text-right">Auto-Approved</TableHead>
            <TableHead className="text-right">Pending</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const mod = moduleMap.get(run.module_id);
            const hasErrors = run.errors > 0;
            return (
              <TableRow key={run.id}>
                <TableCell>
                  <p className="text-sm font-semibold">
                    {mod?.display_name ?? run.module_id.slice(0, 8)}
                  </p>
                  {run.content_type && (
                    <Badge
                      variant="outline"
                      className="h-[18px] text-[0.65rem] mt-0.5"
                    >
                      {run.content_type}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs" title={format(new Date(run.created_at), 'PPpp')}>
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <p className="text-sm">{run.items_scanned}</p>
                </TableCell>
                <TableCell className="text-right">
                  <p className={`text-sm ${run.changes_proposed > 0 ? 'font-semibold' : ''}`}>
                    {run.changes_proposed}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <p
                    className={`text-sm ${run.changes_auto_approved > 0 ? 'text-green-600' : 'text-muted-foreground'}`}
                  >
                    {run.changes_auto_approved}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <p
                    className={`text-sm ${run.changes_pending_review > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}
                  >
                    {run.changes_pending_review}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  {hasErrors ? (
                    <Badge
                      variant="destructive"
                      className="h-5 text-[0.7rem]"
                    >
                      {run.errors}
                    </Badge>
                  ) : (
                    <p className="text-sm text-muted-foreground">0</p>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs font-mono">
                    {formatDuration(run.duration_ms)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
