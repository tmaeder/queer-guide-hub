import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GroundConnection {
  departure: string;
  arrival: string;
  departureTz: string;
  arrivalTz: string;
  fromStop: string;
  toStop: string;
  durationMinutes: number;
  transfers: number;
  lines: string[];
}

/** Real train or coach connections for one day (edge function `ground-connections`). */
export function useGroundConnections({
  from,
  to,
  date,
  mode,
  enabled = true,
}: {
  from: string;
  to: string;
  date?: string;
  mode: 'rail' | 'coach';
  enabled?: boolean;
}) {
  const ready = enabled && from.trim().length >= 2 && to.trim().length >= 2 && !!date;
  return useQuery({
    queryKey: ['ground-connections', mode, date, from.trim().toLowerCase(), to.toLowerCase()],
    enabled: ready,
    retry: false,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<GroundConnection[]> => {
      const { data, error } = await supabase.functions.invoke('ground-connections', {
        body: { from: from.trim(), to, date, mode },
      });
      if (error) throw error;
      if (!Array.isArray(data?.connections)) throw new Error('Connections are unavailable');
      return data.connections as GroundConnection[];
    },
  });
}
