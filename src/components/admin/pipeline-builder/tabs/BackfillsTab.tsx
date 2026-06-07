/**
 * BackfillsTab — global Data Ops panel that turns supervised maintenance
 * scripts into one-click admin runs. Each card runs one batch of a whole-corpus
 * sweep with a dry-run toggle (default on). Status is in-session.
 *
 * Whole-corpus loops should still be driven by crons / pipeline-executor; this
 * panel is for ad-hoc "run a batch now" operator use without dropping to a
 * shell. Every job here supports dry_run so the toggle is honest.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { GLOBAL_BACKFILL_JOBS, type GlobalBackfillJob } from '@/config/backfillJobs';

/** Pull a short human summary out of an edge function's response. */
function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Done.';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['updated', 'checked', 'processed', 'geocoded', 'enriched', 'skipped', 'total']) {
    if (typeof d[key] === 'number') parts.push(`${d[key]} ${key}`);
  }
  if (d.dry_run) parts.unshift('dry run');
  return parts.length ? parts.join(' · ') : 'Done.';
}

function JobCard({ job }: { job: GlobalBackfillJob }) {
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<string | null>(null);

  const { run, isPending } = useAsyncAction(
    async () => {
      const { data, error } = await supabase.functions.invoke(job.fn, {
        body: job.buildBody({ dryRun }),
      });
      if (error) throw error;
      return data;
    },
    {
      successMessage: `${job.label}${dryRun ? ' (dry run)' : ''} complete`,
      errorMessage: `${job.label} failed`,
      onSuccess: (data) => setResult(summarize(data)),
    },
  );

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <CardTitle className="text-15">{job.label}</CardTitle>
        <CardDescription className="text-2xs">{job.description}</CardDescription>
      </div>
      <CardContent className="flex items-center justify-between gap-4 p-0">
        <div className="flex items-center gap-2">
          <Switch
            id={`dry-${job.key}`}
            checked={dryRun}
            onCheckedChange={setDryRun}
            aria-label="Dry run"
          />
          <Label htmlFor={`dry-${job.key}`} className="text-2xs text-muted-foreground">
            Dry run
          </Label>
        </div>
        <Button size="sm" variant="outline" loading={isPending} onClick={() => run()}>
          Run batch
        </Button>
      </CardContent>
      {result && <p className="text-2xs text-muted-foreground">{result}</p>}
    </Card>
  );
}

export default function BackfillsTab() {
  return (
    <div className="p-4">
      <p className="mb-4 text-2xs text-muted-foreground">
        Run one batch of a maintenance sweep on demand. Leave dry run on to preview counts without
        writing. Whole-corpus catch-up still runs via crons.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GLOBAL_BACKFILL_JOBS.map((job) => (
          <JobCard key={job.key} job={job} />
        ))}
      </div>
    </div>
  );
}
