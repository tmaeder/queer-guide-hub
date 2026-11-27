import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Pause, Play } from '@/components/icons';

type Job = {
  status: string;
  attempts: number;
  next_attempt_at: string;
  outcome: { reason?: string; blocker?: string; retry?: string; evidence?: Array<{ url: string }> };
};
type Status = {
  enabled: boolean;
  counts: Record<string, number> | null;
  jobs: Job[];
  production_budget?: {
    cap_nano_usd: number;
    charged_nano_usd: number;
    reserved_nano_usd: number;
    deferred: boolean;
  } | null;
};
export function JevReviewStatus({ caseId }: { caseId?: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['jev-review-status', caseId ?? 'summary'],
    queryFn: async () => {
      const { data, error } = await untypedRpc<Status>('get_jev_review_status', {
        p_case_id: caseId ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await untypedRpc('set_jev_review_enabled', { p_enabled: enabled });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['jev-review-status'] });
    },
  });
  if (!query.data) return null;
  const { enabled, counts, jobs, production_budget: budget } = query.data;
  const job = jobs[0];
  const reason = job?.outcome.blocker || job?.outcome.reason || job?.outcome.retry;
  const requiresHumanDecision =
    job?.status === 'blocked' &&
    [
      'visual_evidence_requires_human_review',
      'mandatory_human_publication_review',
      'protected_review',
      'city_lifecycle_requires_human_review',
    ].includes(reason ?? '');
  const dollars = (nano: number) =>
    (nano / 1e9).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  if (caseId && !job) return null;
  return (
    <div className="mt-2 text-sm text-muted-foreground" aria-label="Jev automation status">
      {caseId && job ? (
        <>
          <p>
            Jev: {job.status} · {job.attempts} attempts
          </p>
          {reason && (
            <p className="mt-1">
              {reason === 'city_lifecycle_requires_human_review'
                ? 'A person must decide whether this placeholder represents a real place.'
                : reason.replace(/_/g, ' ')}
            </p>
          )}
          {job.status === 'blocked' && reason !== 'city_lifecycle_requires_human_review' && (
            <p className="mt-1">
              {requiresHumanDecision
                ? 'This case requires a human decision.'
                : 'Waiting for new evidence or a repaired prerequisite.'}
            </p>
          )}
          {job.status === 'retry' && (
            <p className="mt-1">Next check: {new Date(job.next_attempt_at).toLocaleString()}</p>
          )}
          {job.outcome.evidence?.map(
            ({ url }) =>
              /^https:\/\//.test(url) && (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mr-4 underline underline-offset-4"
                >
                  Source evidence
                </a>
              ),
          )}
        </>
      ) : (
        <div className="inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-element bg-muted px-2 py-1 text-13">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`size-2 rounded-full ${enabled ? 'bg-foreground' : 'border border-foreground'}`}
            />
            <span className="font-semibold text-foreground">
              Jev {enabled ? 'running' : 'paused'}
            </span>
            <span className="tabular-nums">
              · {counts?.applied ?? 0} applied · {counts?.blocked ?? 0} blocked
            </span>
          </span>
          {budget && (
            <span className="tabular-nums">
              Shared production budget:{' '}
              {dollars(budget.charged_nano_usd + budget.reserved_nano_usd)} /{' '}
              {dollars(budget.cap_nano_usd)} this UTC month
              {budget.deferred && ' · processing deferred at the budget limit'}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-2"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!enabled)}
          >
            {enabled ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {enabled ? 'Pause' : 'Resume'}
          </Button>
          {toggle.error && <span role="alert">{toggle.error.message}</span>}
        </div>
      )}
    </div>
  );
}
