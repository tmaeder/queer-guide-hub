import { supabase } from '@/integrations/supabase/client';
export interface TripInvitation {
  id: string;
  trip_id: string;
  trip_title: string;
  inviter_name: string;
  username: string | null;
  role: 'viewer' | 'editor';
  status: string;
  expires_at: string;
  actionable: boolean;
  can_revoke?: boolean;
}
export interface TripInvitationList {
  can_invite: boolean;
  invitations: TripInvitation[];
}
export async function loadTripInvitations(tripId?: string): Promise<TripInvitationList> {
  const name = tripId
    ? `trip-invitations?trip_id=${encodeURIComponent(tripId)}`
    : 'trip-invitations';
  const { data, error } = await supabase.functions.invoke<TripInvitationList>(name, {
    method: 'GET',
  });
  if (error || !data || !Array.isArray(data.invitations))
    throw new Error('Invitation list unavailable');
  return data;
}
export async function changeTripInvitation(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke<{ result: unknown }>('trip-invitations', {
    body,
  });
  if (error || !data)
    throw new Error(
      error?.context?.status === 429 ? 'invitation_rate_limited' : 'Invitation unavailable',
    );
  return data.result;
}
