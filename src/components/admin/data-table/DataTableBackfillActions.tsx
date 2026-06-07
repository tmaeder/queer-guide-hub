/**
 * DataTableBackfillActions — renders one button per selection-scoped backfill
 * job (from the backfillJobs registry) in the data-table bulk bar. Each button
 * invokes its edge function with the selected row ids via useAsyncAction, so
 * retry + error toasting + pending state come for free.
 */
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import type { BackfillJob } from '@/config/backfillJobs';

interface DataTableBackfillActionsProps {
  jobs: BackfillJob[];
  selectedIds: Set<string>;
  onDone?: () => void;
}

// One child per job: keeps the useAsyncAction hook out of a render loop.
function JobButton({
  job,
  selectedIds,
  onDone,
}: {
  job: BackfillJob;
  selectedIds: Set<string>;
  onDone?: () => void;
}) {
  const ids = Array.from(selectedIds);
  const { run, isPending } = useAsyncAction(
    async () => {
      const { data, error } = await supabase.functions.invoke(job.fn, {
        body: job.buildBody(ids),
      });
      if (error) throw error;
      return data;
    },
    {
      successMessage: `${job.label}: ${ids.length} item${ids.length === 1 ? '' : 's'} queued`,
      errorMessage: `${job.label} failed`,
      onSuccess: () => onDone?.(),
    },
  );

  return (
    <Button
      variant="outline"
      size="sm"
      loading={isPending}
      onClick={() => {
        if (job.confirm && !window.confirm(job.confirm)) return;
        run();
      }}
    >
      {job.label}
    </Button>
  );
}

export function DataTableBackfillActions({
  jobs,
  selectedIds,
  onDone,
}: DataTableBackfillActionsProps) {
  if (jobs.length === 0) return null;
  return (
    <>
      {jobs.map((job) => (
        <JobButton key={job.key} job={job} selectedIds={selectedIds} onDone={onDone} />
      ))}
    </>
  );
}
