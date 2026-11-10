import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

/**
 * What the caller may do with a trip, decided the way the database's own RLS
 * decides it, for edge functions that read and write trip data with the
 * service-role client (which bypasses RLS entirely).
 *
 * Mirrors `trips_select` (public, owner, or accepted member via
 * api_private.is_trip_member) and `api_private.can_edit_trip` (accepted
 * member with role owner/editor). An invite that has not been accepted grants
 * nothing, as in the database.
 *
 *   'none'  - may not see the trip at all
 *   'public' - may see the public itinerary
 *   'read'   - accepted viewer with access to private member data
 *   'edit'  - owner, or an accepted owner/editor member
 */
export type TripAccess = 'none' | 'public' | 'read' | 'edit'

export async function tripAccess(admin: SupabaseClient, tripId: string, userId: string): Promise<TripAccess> {
  const { data: trip, error } = await admin
    .from('trips')
    .select('id, owner_id, is_public')
    .eq('id', tripId)
    .maybeSingle()
  if (error || !trip) return 'none'
  if (trip.owner_id === userId) return 'edit'

  const { data: member } = await admin
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (member) return member.role === 'owner' || member.role === 'editor' ? 'edit' : 'read'
  return trip.is_public === true ? 'public' : 'none'
}
