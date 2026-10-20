// Mirrors a Queer Guide action into the user's Bluesky repo as a guide.queer.*
// record — only when they connected Bluesky AND turned on "Publish my activity".
// Fire-and-forget: the Queer Guide action has already succeeded, and a Bluesky
// failure must never undo or block it.
import { supabase } from '@/integrations/supabase/client';
import type { ActivityEntity, ActivityKind, ActivitySubject } from '@/lib/atprotoClient';

export interface ActivityInput {
  kind: ActivityKind;
  entityType: ActivityEntity;
  entityId: string;
  /** Remove the record (un-save, not going any more). Never applies to check-ins. */
  remove?: boolean;
  rating?: number;
  status?: 'going' | 'interested';
}

async function run(input: ActivityInput): Promise<void> {
  const { data: identity } = await supabase
    .from('bluesky_identities')
    .select('did, publish_activity')
    .maybeSingle();
  const row = identity;
  if (!row?.did || !row.publish_activity) return;

  const client = await import('@/lib/atprotoClient');
  if (input.remove) {
    await client.writeActivityRecord(row.did, input.kind, input.entityType, input.entityId, null);
    return;
  }
  // The server decides what may be published (gated, sexual-venue and high-risk places refused).
  const { data: subject } = await supabase.rpc(
    'bluesky_activity_subject' as never,
    { p_entity_type: input.entityType, p_entity_id: input.entityId } as never,
  );
  if (!subject) return;
  const record = client.activityRecord(input.kind, input.entityType, subject as ActivitySubject, {
    rating: input.rating,
    status: input.status,
  });
  await client.writeActivityRecord(row.did, input.kind, input.entityType, input.entityId, record);
}

export function mirrorActivity(input: ActivityInput): void {
  run(input).catch((e) => console.warn('[bluesky] activity not published:', e));
}

/** RSVP shorthand: going/interested publish, anything else removes the record. */
export function mirrorRsvp(eventId: string, status: string): void {
  mirrorActivity(
    status === 'going' || status === 'interested'
      ? { kind: 'rsvp', entityType: 'event', entityId: eventId, status }
      : { kind: 'rsvp', entityType: 'event', entityId: eventId, remove: true },
  );
}
