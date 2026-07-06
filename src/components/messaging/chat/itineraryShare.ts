/** Metadata stored on `messages.metadata` for message_type='itinerary'. */
export interface ItineraryMeta {
  kind: 'itinerary';
  /** travel_inbox_items.id — drives Approve / Reject / Add-to-trip actions. */
  item_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'slotted';
  /** lodging | flight | rail | restaurant | activity | unknown (or null). */
  booking_type?: string | null;
  vendor?: string | null;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
  price?: number | null;
  currency?: string | null;
  confirmation?: string | null;
}

export function isItineraryMeta(meta: unknown): meta is ItineraryMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    (meta as { kind?: string }).kind === 'itinerary' &&
    typeof (meta as { item_id?: unknown }).item_id === 'string' &&
    typeof (meta as { status?: unknown }).status === 'string'
  );
}
