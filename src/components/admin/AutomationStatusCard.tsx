import { AlertTriangle, Bot, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useReviewAutomationStatus } from '@/hooks/useReviewAutomationStatus';
import { cadenceLabel } from '@/lib/automationCadence';

/** Jobs this card reports on, with the plain-language claim each one backs. */
const JOBS: { slug: string; label: string }[] = [
  { slug: 'staging_reconcile_committed', label: 'Staging reconcile' },
  { slug: 'review_queue_autoapprove', label: 'Auto-approve' },
  { slug: 'review_queue_close_unactionable', label: 'Close unactionable' },
  { slug: 'dedup_close_distinct', label: 'Close distinct pairs' },
];

function Figure({
  value,
  label,
  hint,
  tone,
}: {
  value: number;
  label: string;
  hint: string;
  tone: 'automated' | 'human';
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="text-headline font-bold leading-none tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-13 font-semibold">{label}</span>
        <span
          className={`rounded-badge px-2 py-0.5 text-2xs font-medium ${
            tone === 'automated'
              ? 'bg-muted text-muted-foreground'
              : 'bg-foreground text-background'
          }`}
        >
          {tone === 'automated' ? 'Automated' : 'Action needed'}
        </span>
      </div>
      <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Splits the two review surfaces into "the machine clears this" and "this is
 * yours", because one combined number is what made a working pipeline look
 * stuck: 44% of the staging queue was rows the pipeline had already committed
 * or rejected, and a third of the review queue is above the auto-approval
 * threshold.
 *
 * Deliberately renders nothing while loading and an explicit notice when the
 * RPC returns no payload. An admin without the role gets `{}`, and showing
 * zeroes there would read as "the queues are empty" — the absence-vs-clean
 * confusion this codebase keeps re-learning (an unattached trigger and a quiet
 * week both produce zero).
 */
export function AutomationStatusCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, isError } = useReviewAutomationStatus();

  if (isLoading) return null;

  if (isError || !data) {
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1.5 text-2xs text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Automation status unavailable
        </span>
      );
    }
    return (
      <Card className="rounded-container border-destructive/30 bg-destructive/[0.03] shadow-none">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-13 text-muted-foreground">
            Automation status unavailable — this is not the same as an empty queue. Check the role
            gate on <code className="text-2xs">review_automation_status</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { review_queue: rq, staging, dedup, jobs } = data;
  const machine = rq.auto_applies + rq.auto_closes + staging.auto_reconciles;
  const human = rq.needs_human + staging.needs_human + dedup.open;
  const cadence = cadenceLabel(jobs);
  const offJobs = JOBS.filter((j) => jobs?.[j.slug] && jobs[j.slug].enabled === false);
  const missing = JOBS.filter((j) => !jobs?.[j.slug]);

  if (compact) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Bot className="size-3.5" aria-hidden="true" />
          <span className="font-semibold tabular-nums text-foreground">
            {machine.toLocaleString()}
          </span>
          automated{cadence ? ` · ${cadence}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <User className="size-3.5" aria-hidden="true" />
          <span className="font-semibold tabular-nums text-foreground">
            {human.toLocaleString()}
          </span>
          need review
        </span>
        {(offJobs.length > 0 || missing.length > 0) && (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {offJobs.length + missing.length} automation issue
            {offJobs.length + missing.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden rounded-container border-border-hairline bg-card shadow-none">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 divide-y divide-border-hairline sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex items-start gap-4 px-4 py-4 md:px-6">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-element bg-muted">
              <Bot className="size-4" aria-hidden="true" />
            </span>
            <Figure
              value={machine}
              label={cadence ? `Cleared without you — ${cadence}` : 'Cleared without you'}
              hint={`${rq.auto_applies.toLocaleString()} applied · ${rq.auto_closes.toLocaleString()} closed unread · ${staging.auto_reconciles.toLocaleString()} already done, status stale`}
              tone="automated"
            />
          </div>
          <div className="flex items-start gap-4 px-4 py-4 md:px-6">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-element bg-foreground text-background">
              <User className="size-4" aria-hidden="true" />
            </span>
            <Figure
              value={human}
              label="Actually needs you"
              hint={`${rq.needs_human.toLocaleString()} below threshold · ${staging.needs_human.toLocaleString()} staging · ${dedup.open.toLocaleString()} duplicate pairs`}
              tone="human"
            />
          </div>
        </div>

        {/* A job that is OFF must say so. A drain nobody scheduled looks
            identical to a drain that ran and found nothing. */}
        {(offJobs.length > 0 || missing.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-hairline px-4 py-2 md:px-6">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              Not running
            </span>
            {offJobs.map((j) => (
              <Badge key={j.slug} variant="outline" className="rounded-badge">
                {j.label} — disabled
              </Badge>
            ))}
            {missing.map((j) => (
              <Badge key={j.slug} variant="outline" className="rounded-badge">
                {j.label} — not deployed
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
