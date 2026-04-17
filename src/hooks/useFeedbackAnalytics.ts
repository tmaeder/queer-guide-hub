import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DailyVolumeRow {
  day: string;
  content_type: string;
  feedback_status: string;
  category: string | null;
  priority: number;
  n: number;
}

export interface SlaStatRow {
  category: string;
  priority: number;
  resolved_n: number;
  median_seconds: number | null;
  p95_seconds: number | null;
}

export interface ApiErrorDailyRow {
  submission_id: string;
  fingerprint: string;
  day: string;
  n: number;
}

/** Daily volume rows from v_feedback_analytics_daily (180d window server-side). */
export function useFeedbackDailyVolume() {
  return useQuery<DailyVolumeRow[]>({
    queryKey: ['admin-feedback-analytics-daily'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('v_feedback_analytics_daily' as any)
        .select('day,content_type,feedback_status,category,priority,n');
      if (error) throw error;
      return (data || []) as unknown as DailyVolumeRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useFeedbackSlaStats(daysWindow = 90) {
  return useQuery<SlaStatRow[]>({
    queryKey: ['admin-feedback-sla', daysWindow],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('feedback_sla_stats', {
        p_days_window: daysWindow,
      });
      if (error) throw error;
      return (data || []) as SlaStatRow[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Occurrence counts per error submission per day (for sparklines). */
export function useApiErrorDailySeries() {
  return useQuery<ApiErrorDailyRow[]>({
    queryKey: ['admin-api-error-daily'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('v_api_error_daily' as any)
        .select('submission_id,fingerprint,day,n');
      if (error) throw error;
      return (data || []) as unknown as ApiErrorDailyRow[];
    },
    staleTime: 2 * 60_000,
  });
}

/**
 * Build day-bucketed series (length `days`, oldest→newest) from raw rows.
 * Returns an array of `n` per day, zero-filled for missing days.
 */
export function toDailySeries(rows: ApiErrorDailyRow[], days = 14): number[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const series = new Array(days).fill(0);
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.n);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    series[i] = byDay.get(key) ?? 0;
  }
  return series;
}
