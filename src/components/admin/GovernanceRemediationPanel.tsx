import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useGovernanceRemediationSummary } from '@/hooks/useGovernanceRemediationSummary';

/** Makes the finite remediation denominator visible beside the live engines. */
export function GovernanceRemediationPanel() {
  const { data, isLoading, isError } = useGovernanceRemediationSummary();

  if (isLoading) return null;
  if (isError || !data?.run) {
    return (
      <Card className="rounded-container">
        <CardContent className="flex items-start gap-2 p-4 text-13 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Remediation accounting unavailable. Live engine counts remain visible below.
        </CardContent>
      </Card>
    );
  }

  const open = data.by_engine.reduce(
    (sum, row) =>
      sum +
      (row.resolution_state === 'open' || row.resolution_state === 'in_progress' ? row.items : 0),
    0,
  );
  const repaired = data.by_engine.reduce(
    (sum, row) => sum + (row.resolution_state === 'resolved' ? row.items : 0),
    0,
  );
  const terminal = data.by_engine.reduce(
    (sum, row) => sum + (row.resolution_state === 'terminal' ? row.items : 0),
    0,
  );
  const complete = data.run.status === 'completed' && open === 0;

  return (
    <Card className="rounded-container">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            {complete ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div>
              <p className="text-13 font-bold">All-engine remediation baseline</p>
              <p className="text-2xs text-muted-foreground">
                Every captured item retains its original evidence and ends as repaired or an
                explicit terminal disposition.
              </p>
            </div>
          </div>
          <Badge variant={complete ? 'secondary' : 'outline'} className="tabular-nums">
            {complete ? 'Complete' : `${open.toLocaleString()} open`}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric value={data.run.initial_items} label="Captured" />
          <Metric value={repaired} label="Repaired / reviewed" />
          <Metric value={terminal} label="Explicitly terminal" />
          <Metric value={open} label="Open" />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-title font-bold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </div>
  );
}
