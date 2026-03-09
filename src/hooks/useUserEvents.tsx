import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from './useAuth';

export type UserEventAttendance = {
  id: string;
  status: 'going' | 'interested' | 'not_going';
  created_at: string;
  event: {
    id: string;
    title: string;
    start_date: string;
    end_date?: string;
    city: string;
    event_type: string;
    featured: boolean;
    venue_name?: string;
    address?: string;
  };
};

export function useUserEvents() {
  const { user } = useAuth();
  const [attendances, setAttendances] = useState<UserEventAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserEvents = async () => {
    if (!user) {
      setAttendances([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('event_attendees')
        .select(`
          id,
          status,
          created_at,
          event:events(
            id,
            title,
            start_date,
            end_date,
            city,
            event_type,
            featured,
            venue_name,
            address
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['going', 'interested'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = data?.map(attendance => ({
        id: attendance.id,
        status: attendance.status as 'going' | 'interested' | 'not_going',
        created_at: attendance.created_at,
        event: attendance.event as any
      })) || [];

      setAttendances(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserEvents();
  }, [user]);

  return {
    attendances,
    loading,
    error,
    refetch: fetchUserEvents,
  };
}