import { supabase } from '@/integrations/supabase/client';

export interface TripShare {
  id: string;
  trip_id: string;
  token: string;
  permissions: {
    itinerary: boolean;
    budget: boolean;
    notes: boolean;
    packing: boolean;
  };
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export async function fetchTripShares(tripId: string): Promise<TripShare[]> {
  const { data, error } = await supabase
    .from('trip_shares')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as TripShare[];
}

export async function createTripShare(input: {
  tripId: string;
  createdBy: string | null;
  permissions: TripShare['permissions'];
  expiresAt: string | null;
}): Promise<TripShare> {
  const { data, error } = await supabase
    .from('trip_shares')
    .insert({
      trip_id: input.tripId,
      created_by: input.createdBy,
      permissions: input.permissions,
      expires_at: input.expiresAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TripShare;
}

export async function deleteTripShare(id: string): Promise<void> {
  const { error } = await supabase.from('trip_shares').delete().eq('id', id);
  if (error) throw error;
}
