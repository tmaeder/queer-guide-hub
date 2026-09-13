import { useCallback, useRef } from 'react';
import { insertTelemetry } from '@/lib/telemetryInsert';
import { useAuth } from '@/hooks/useAuth';
import { analyticsAllowed } from '@/lib/analyticsConsent';

const SESSION_KEY = 'qg_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Behavioural events feeding recommendations, trending and the personalization
 * signal (`recommendation-engine`, `get_trending_entities`, `get_user_signal`).
 *
 * This union is one half of a contract. The other half is the
 * `user_events_event_type_known` CHECK in the migrations, and
 * `src/hooks/__tests__/userEventsVocabularyDrift.test.ts` fails if they
 * disagree. Widen both in the SAME commit, always:
 * `docs/audits/2026-08-21-signup-consent-gap.md` is what happens otherwise —
 * Postgres rejects the write, the hook swallows it, and the resulting zero
 * gets read as a fact about users.
 */
type EventType =
  | 'page_view'
  | 'search'
  | 'booking_click'
  | 'favorite_add'
  | 'favorite_remove'
  | 'deal_view'
  | 'trip_create'
  | 'hotel_view'
  | 'activity_view';

type EntityType = 'city' | 'country' | 'hotel' | 'venue' | 'event' | 'flight' | 'activity';

interface TrackEventParams {
  eventType: EventType;
  entityType?: EntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export function useTrackEvent() {
  const { user } = useAuth();
  const pendingRef = useRef<Set<string>>(new Set());

  const track = useCallback(
    async ({ eventType, entityType, entityId, metadata }: TrackEventParams) => {
      // Behavioural profiling is not a strictly-necessary cookie. These rows
      // carry user_id, entity_type and entity_id — on this platform an
      // entity_id trail through venues, events and intimate features is itself
      // sensitive — so they need the same consent the page-view tracker needs.
      // This writer had no gate at all until 2026-09-12, and the table was not
      // named in the Privacy or Cookie policy either.
      if (!analyticsAllowed()) return;

      // Dedupe rapid-fire events (same event+entity within 2s)
      const dedupeKey = `${eventType}:${entityType}:${entityId}`;
      if (pendingRef.current.has(dedupeKey)) return;
      pendingRef.current.add(dedupeKey);
      setTimeout(() => pendingRef.current.delete(dedupeKey), 2000);

      // insertTelemetry inspects the resolved `{ error }`. The `try/catch`
      // that used to be here caught nothing: PostgREST resolves with an error
      // object rather than throwing, so a CHECK or RLS rejection vanished
      // without a trace and the missing rows looked like missing users.
      await insertTelemetry('user_events', {
        user_id: user?.id || null,
        event_type: eventType,
        entity_type: entityType || null,
        entity_id: entityId || null,
        metadata: metadata || {},
        session_id: user ? null : getSessionId(),
      });
    },
    [user],
  );

  return { track };
}
