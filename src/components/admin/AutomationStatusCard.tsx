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

function Figure({ value, label, hint }: { value: number; label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-headline font-bold leading-none tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-13 font-bold">{label}</span>
      <span className="text-2xs text-muted-foreground leading-snug">{hint}</span>
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
export function AutomationStatusCard() {
  const { data, isLoading, isError } = useReviewAutomationStatus();

  if (isLoading) return null;

  if (isError || !data) {
    return (
      <Card className="rounded-container">
        <CardContent className="flex items-start gap-2 p-4">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
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

  return (
    <Card className="rounded-container">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <Bot className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <Figure
              value={machine}
              label={cadence ? `Cleared without you — ${cadence}` : 'Cleared without you'}
              hint={`${rq.auto_applies.toLocaleString()} applied · ${rq.auto_closes.toLocaleString()} closed unread · ${staging.auto_reconciles.toLocaleString()} already done, status stale`}
            />
          </div>
          <div className="flex items-start gap-2">
            <User className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <Figure
              value={human}
              label="Actually needs you"
              hint={`${rq.needs_human.toLocaleString()} below threshold · ${staging.needs_human.toLocaleString()} staging · ${dedup.open.toLocaleString()} duplicate pairs`}
            />
          </div>
        </div>

        {/* A job that is OFF must say so. A drain nobody scheduled looks
            identical to a drain that ran and found nothing. */}
        {(offJobs.length > 0 || missing.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-hairline pt-4">
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
