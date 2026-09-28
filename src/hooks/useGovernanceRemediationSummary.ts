import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GovernanceRemediationRun {
  id: string;
  label: string;
  status: string;
  captured_at: string;
  completed_at: string | null;
  initial_items: number;
  resolved_items: number;
}

export interface GovernanceRemediationEngineCount {
  engine: string;
  resolution_state: 'open' | 'in_progress' | 'resolved' | 'terminal';
  items: number;
}

export interface GovernanceRemediationSummary {
  run: GovernanceRemediationRun;
  by_engine: GovernanceRemediationEngineCount[];
  open_by_finding: { finding_key: string; items: number }[];
}

/** Immutable baseline accounting for the latest all-engine remediation run. */
export function useGovernanceRemediationSummary() {
  return useQuery({
    queryKey: ['governance-remediation-summary', 'latest'],
    queryFn: async (): Promise<GovernanceRemediationSummary> => {
      // The RPC is deployed in the same migration set. `as never` keeps this
      // build compatible until generated database types are refreshed.
      const { data, error } = await supabase.rpc('latest_governance_remediation_summary' as never);
      if (error) throw error;
      if (!data) throw new Error('Governance remediation summary is unavailable');
      return data as unknown as GovernanceRemediationSummary;
    },
    staleTime: 60_000,
  });
}
