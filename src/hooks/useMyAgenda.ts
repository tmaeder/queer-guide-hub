import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type AgendaKind = 'trip' | 'reservation' | 'event_rsvp' | 'event_saved' | 'group_event';

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string | null;
  open_target: string;
}

export interface AgendaDay {
  /** Local YYYY-MM-DD key. */
  date: string;
  items: AgendaItem[];
}

/** Local YYYY-MM-DD for grouping (avoids UTC day-boundary drift). */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The viewer's upcoming commitments (trips, reservations, event RSVPs, dated
 * saved events, and events from groups they belong to) for a rolling window,
 * grouped by day. Backed by the get_my_agenda RPC (one UNION, no new tables).
 */
export function useMyAgenda(from: Date, to: Date) {
  const { user } = useAuth();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const query = useQuery({
    queryKey: ['my-agenda', user?.id, fromIso, toIso],
    enabled: !!user,
    queryFn: async (): Promise<AgendaItem[]> => {
      const { data, error } = await untypedRpc<AgendaItem[]>('get_my_agenda', {
        p_from: fromIso,
        p_to: toIso,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = query.data ?? [];
  const days: AgendaDay[] = [];
  const byKey = new Map<string, AgendaDay>();
  for (const item of items) {
    const key = localDayKey(item.starts_at);
    let day = byKey.get(key);
    if (!day) {
      day = { date: key, items: [] };
      byKey.set(key, day);
      days.push(day);
    }
    day.items.push(item);
  }

  return {
    items,
    days,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
