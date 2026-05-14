/**
 * useReportHotline — insert a community report into public.hotline_reports.
 * Wraps the supabase call so the component doesn't trigger the
 * queerguide/no-supabase-from-in-pages lint rule.
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Reason = 'disconnected' | 'wrong_number' | 'closed' | 'unsafe' | 'other';

export interface ReportInput {
  hotlineId: string;
  reason: Reason;
  detail?: string | null;
}

export function useReportHotline() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: ReportInput): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    const { error: e } = await supabase.from('hotline_reports').insert({
      hotline_id: input.hotlineId,
      reason: input.reason,
      detail: input.detail?.trim() || null,
    });
    setSubmitting(false);
    if (e) {
      setError(e.message);
      return false;
    }
    return true;
  };

  return { submit, submitting, error };
}
