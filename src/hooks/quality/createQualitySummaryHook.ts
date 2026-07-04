import { useQuery, type UseQueryResult } from '@tanstack/react-query';

// Shared skeleton for the *QualitySummary admin hooks (city/village/amenity/
// personality): one useQuery whose queryFn fans out a Promise.all of postgrest
// count/row queries and reshapes the results into a summary object. Each hook
// supplies its metric thunks and reshape; the factory owns the fan-out and the
// count/data coercion. (News and Event stay custom — different shapes.)

interface CountMetric {
  kind: 'count';
  build: () => PromiseLike<{ count: number | null }>;
}
interface RowsMetric {
  kind: 'rows';
  build: () => PromiseLike<{ data: unknown }>;
}
interface SingleMetric {
  kind: 'single';
  build: () => PromiseLike<{ data: unknown }>;
}
export type MetricSpec = CountMetric | RowsMetric | SingleMetric;

type MetricResult<M extends MetricSpec> = M extends CountMetric
  ? number
  : M extends RowsMetric
    ? unknown[]
    : unknown;

export type MetricResults<M extends Record<string, MetricSpec>> = {
  [K in keyof M]: MetricResult<M[K]>;
};

export function createQualitySummaryHook<M extends Record<string, MetricSpec>, TSummary>(opts: {
  queryKey: string;
  metrics: M;
  reshape: (results: MetricResults<M>) => TSummary;
  staleTime?: number;
}): () => UseQueryResult<TSummary> {
  return function useQualitySummary(): UseQueryResult<TSummary> {
    return useQuery<TSummary>({
      queryKey: [opts.queryKey],
      queryFn: async () => {
        const keys = Object.keys(opts.metrics) as (keyof M)[];
        const settled = await Promise.all(keys.map((k) => opts.metrics[k].build()));
        const out = {} as MetricResults<M>;
        keys.forEach((k, i) => {
          const spec = opts.metrics[k];
          const res = settled[i] as { count?: number | null; data?: unknown };
          out[k] = (
            spec.kind === 'count'
              ? (res.count ?? 0)
              : spec.kind === 'rows'
                ? ((res.data ?? []) as unknown[])
                : (res.data ?? null)
          ) as MetricResult<M[typeof k]>;
        });
        return opts.reshape(out);
      },
      staleTime: opts.staleTime ?? 60_000,
    });
  };
}
