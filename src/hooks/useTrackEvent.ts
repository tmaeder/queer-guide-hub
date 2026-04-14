import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SESSION_KEY = 'qg_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

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
      // Dedupe rapid-fire events (same event+entity within 2s)
      const dedupeKey = `${eventType}:${entityType}:${entityId}`;
      if (pendingRef.current.has(dedupeKey)) return;
      pendingRef.current.add(dedupeKey);
      setTimeout(() => pendingRef.current.delete(dedupeKey), 2000);

      try {
        await supabase.from('user_events').insert({
          user_id: user?.id || null,
          event_type: eventType,
          entity_type: entityType || null,
          entity_id: entityId || null,
          metadata: metadata || {},
          session_id: user ? null : getSessionId(),
        });
      } catch {
        // Silent fail — tracking should never block UX
      }
    },
    [user],
  );

  return { track };
}
