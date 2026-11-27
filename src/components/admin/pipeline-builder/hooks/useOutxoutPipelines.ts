import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

const warningProjection = [
  'last_error:summary->last_error',
  ...['Belfast', 'Brighton', 'Glasgow', 'Liverpool', 'Newcastle', 'Edinburgh'].map(
    (city) => `${city.toLowerCase()}:summary->source_cache->${city}->errors`,
  ),
].join(',');

const PIPELINES = [
  {
    name: 'outxout-catalogue-sync',
    label: 'Out x Out catalogue sync',
    automation: 'outxout_weekly_sync',
    cron: '0 6,7 * * 3',
    hour: '08:00',
  },
  {
    name: 'outxout-official-date-review',
    label: 'Out x Out official-date checks',
    automation: 'outxout_official_dates_weekly',
    cron: '0 7,8 * * 3',
    hour: '09:00',
  },
] as const;

type Data = Record<string, unknown>;
export interface OutxoutRun {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  items_total: number;
  duration_ms: number | null;
  error_message: string | null;
  context: Data;
}
export interface OutxoutPipeline {
  name: string;
  label: string;
  pipelineId: string | null;
  automation: string;
  enabled: boolean;
  schedule: string;
  scheduleLabel: string;
  run: OutxoutRun | null;
  recentRuns: OutxoutRun[];
  warnings: { url: string; error: string }[];
  error: string | null;
}

/** Native source runs only: exclude canaries and redundant UI dry-run probes. */
export function isOutxoutRun(name: string, run: OutxoutRun) {
  if (run.context?.dry_run === true) return false;
  return name === 'outxout-catalogue-sync'
    ? run.context?.scope === 'catalogue'
    : typeof run.context?.policy === 'string' &&
        run.context.policy.startsWith('outxout-official-dates-');
}

export async function loadOutxoutPipelines(): Promise<OutxoutPipeline[]> {
  const [definitions, automations, ...histories] = await Promise.all([
    untypedFrom('pipeline_definitions')
      .select('id,name,is_enabled')
      .in(
        'name',
        PIPELINES.map((p) => p.name),
      ),
    untypedFrom('admin_automations')
      .select('slug,enabled,schedule,trigger')
      .in(
        'slug',
        PIPELINES.map((p) => p.automation),
      ),
    // Query each pipeline separately: busy unrelated jobs cannot evict its latest result.
    ...PIPELINES.map((p) => {
      let query = untypedFrom('pipeline_runs')
        .select(
          'id,status,created_at,started_at,completed_at,items_processed,items_succeeded,items_failed,items_total,duration_ms,error_message,context',
        )
        .eq('pipeline_name', p.name);
      query =
        p.name === 'outxout-catalogue-sync'
          ? query.eq('context->>scope', 'catalogue')
          : query
              .like('context->>policy', 'outxout-official-dates-%')
              .or('context->>dry_run.is.null,context->>dry_run.neq.true');
      return query.order('created_at', { ascending: false }).limit(10);
    }),
  ]);
  for (const response of [definitions, automations, ...histories])
    if (response.error) throw response.error;
  const rows = PIPELINES.map((pipeline, index): OutxoutPipeline => {
    const definition = ((definitions.data as Data[]) ?? []).find((d) => d.name === pipeline.name);
    const automation = ((automations.data as Data[]) ?? []).find(
      (a) => a.slug === pipeline.automation,
    );
    const recentRuns = ((histories[index].data ?? []) as unknown as OutxoutRun[]).filter((r) =>
      isOutxoutRun(pipeline.name, r),
    );
    const run = recentRuns[0] ?? null;
    const timezone = (automation?.trigger as Data | undefined)?.timezone;
    const knownSchedule = automation?.schedule === pipeline.cron && timezone === 'Europe/Zurich';
    return {
      name: pipeline.name,
      label: pipeline.label,
      automation: pipeline.automation,
      pipelineId: (definition?.id as string) ?? null,
      enabled: definition?.is_enabled === true && automation?.enabled === true,
      schedule: (automation?.schedule as string) ?? '',
      scheduleLabel: knownSchedule
        ? `Wednesdays at ${pipeline.hour} · Europe/Zurich`
        : automation?.schedule
          ? `${automation.schedule} · ${timezone ?? 'UTC'}`
          : 'Schedule not registered',
      run,
      recentRuns,
      warnings: [],
      error:
        !definition || !automation
          ? 'Pipeline or schedule registration is missing.'
          : (run?.error_message ??
            (run?.status === 'failed'
              ? 'The latest run failed.'
              : run && run.items_failed > 0
                ? `${run.items_failed} items failed in the latest run.`
                : null)),
    };
  });
  const dates = rows[1];
  const ledgerId = dates.run?.context?.review_ledger_id;
  if (ledgerId) {
    // Project only error arrays. Never download full private source/model captures into this summary.
    const { data, error } = await untypedFrom('admin_automation_runs')
      .select(warningProjection)
      .eq('id', ledgerId)
      .eq('automation_slug', dates.automation)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Official-date review details are unavailable.');
    const detail = data as unknown as Data;
    const unique = new Map<string, { url: string; error: string }>();
    for (const city of ['belfast', 'brighton', 'glasgow', 'liverpool', 'newcastle', 'edinburgh']) {
      for (const warning of (detail[city] ?? []) as { url: string; error: string }[])
        unique.set(`${warning.url}:${warning.error}`, warning);
    }
    dates.warnings = [...unique.values()];
    if (dates.run?.status === 'running' && detail.last_error)
      dates.error = `Retry pending: ${(detail.last_error as Data).error}`;
  }
  return rows;
}

export function useOutxoutPipelines() {
  return useQuery({
    queryKey: ['outxout-pipeline-status'],
    queryFn: loadOutxoutPipelines,
    refetchInterval: 30_000,
  });
}
