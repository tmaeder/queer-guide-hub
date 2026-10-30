import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';

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
          {reason && <p className="mt-1">{reason.replace(/_/g, ' ')}</p>}
          {job.status === 'blocked' && (
            <p className="mt-1">Waiting for new evidence or a repaired prerequisite.</p>
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
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Jev {enabled ? 'running' : 'paused'} · {counts?.applied ?? 0} applied ·{' '}
            {counts?.blocked ?? 0} blocked
          </span>
          {budget && (
            <span>
              Shared production budget:{' '}
              {dollars(budget.charged_nano_usd + budget.reserved_nano_usd)} /{' '}
              {dollars(budget.cap_nano_usd)} this UTC month
              {budget.deferred && ' · processing deferred at the budget limit'}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!enabled)}
          >
            {enabled ? 'Pause' : 'Resume'}
          </Button>
          {toggle.error && <span role="alert">{toggle.error.message}</span>}
        </div>
      )}
    </div>
  );
}
