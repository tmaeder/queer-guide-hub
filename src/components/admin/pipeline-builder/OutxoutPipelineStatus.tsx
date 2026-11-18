import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Badge } from '@/components/ui/badge';
import { useOutxoutPipelines, type OutxoutPipeline } from './hooks/useOutxoutPipelines';

function runTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
function resultText(row: OutxoutPipeline) {
  const run = row.run;
  if (!run) return 'No run recorded yet.';
  if (row.name === 'outxout-official-date-review')
    return `${run.items_processed.toLocaleString()} events checked · ${Number(run.context.approved ?? 0).toLocaleString()} approved · ${run.items_failed.toLocaleString()} errors`;
  return `${run.items_processed.toLocaleString()} records checked · ${Number(run.context.changed ?? 0).toLocaleString()} changed or staged · ${Number(run.context.held ?? 0).toLocaleString()} held for review · ${run.items_failed.toLocaleString()} errors`;
}

export default function OutxoutPipelineStatus() {
  const status = useOutxoutPipelines();
  return (
    <section aria-labelledby="outxout-status-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="outxout-status-heading" className="text-title font-semibold">
          Out x Out pipelines
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          {status.isFetching ? 'Refreshing…' : 'Refresh Out x Out status'}
        </Button>
      </div>
      {status.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading schedules and latest results…
        </p>
      )}
      {status.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load Out x Out pipeline status. Refresh to retry.
        </p>
      )}
      {status.data && (
        <ul className="divide-y divide-border border-y border-border">
          {status.data.map((row) => (
            <li key={row.name} className="grid gap-4 py-4 md:grid-cols-3">
              <div className="space-y-1">
                <h3 className="font-medium">{row.label}</h3>
                <p className="text-sm text-muted-foreground">{row.scheduleLabel}</p>
                <Badge variant="secondary">{row.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <div>
                  <Link
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    to={`/admin/automation?automation=${encodeURIComponent(row.automation)}`}
                  >
                    View schedule
                  </Link>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Latest run: {row.run?.status ?? 'Not run'}</p>
                {row.run && (
                  <time
                    className="block text-muted-foreground"
                    dateTime={row.run.completed_at ?? row.run.started_at ?? row.run.created_at}
                  >
                    {runTime(row.run.completed_at ?? row.run.started_at ?? row.run.created_at)} ·
                    Zurich time
                  </time>
                )}
                {row.run ? <p>{resultText(row)}</p> : <AdminEmpty noun="runs" variant="inline" />}
                {row.pipelineId && (
                  <Link
                    className="inline-block text-primary underline-offset-4 hover:underline"
                    to={`/admin/pipelines?pipeline=${encodeURIComponent(row.name)}`}
                  >
                    View pipeline and run history
                  </Link>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {row.error ? (
                  <p role="alert" className="break-words text-destructive">
                    {row.error}
                  </p>
                ) : row.run ? (
                  <p className="text-muted-foreground">No run errors.</p>
                ) : null}

                {row.warnings.length > 0 && (
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {row.warnings.length} source{' '}
                      {row.warnings.length === 1 ? 'warning' : 'warnings'}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {row.warnings.map((warning) => (
                        <li className="break-words" key={`${warning.url}:${warning.error}`}>
                          <p>{warning.error.replace(/^source_http_/, 'HTTP ')}</p>
                          {warning.url.startsWith('https://') ? (
                            <a
                              className="text-primary underline-offset-4 hover:underline"
                              href={warning.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {warning.url}
                            </a>
                          ) : (
                            warning.url
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
