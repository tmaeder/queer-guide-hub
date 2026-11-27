export type SharedSection = 'itinerary' | 'budget' | 'notes' | 'packing';

const ORDER: SharedSection[] = ['itinerary', 'budget', 'notes', 'packing'];

/**
 * The sections a share link grants, in page order. get_shared_trip_view
 * leaves ungranted sections out server-side; this only decides what the page
 * names and which tab opens first. A share is always view-only: the RPC
 * returns no edit permission.
 */
export function grantedSections(
  permissions: Partial<Record<SharedSection, boolean>> | null | undefined,
): SharedSection[] {
  return ORDER.filter((s) => !!permissions?.[s]);
}
