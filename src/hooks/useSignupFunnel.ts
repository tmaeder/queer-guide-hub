import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * MUST stay in sync with the `signup_funnel_events_event_check` CHECK
 * constraint (widened in migration 20260915090000).
 *
 * These two drifted once and it was invisible: `signup_validation_error` was
 * in this union and NOT in the constraint, so Postgres rejected every insert
 * and the fire-and-forget writer below swallowed the rejection into a
 * console.debug. The funnel then reported zero validation errors, which was
 * read as a fact about users rather than a row that could never be written.
 * Adding a name here without widening the constraint recreates that exactly.
 */
export type FunnelEvent =
  | 'signup_landing_view'
  | 'signup_submit_attempt'
  | 'oauth_start'
  | 'oauth_complete'
  | 'signup_validation_error'
  | 'signup_completed'
  | 'email_verified'
  | 'onboarding_skipped'
  | 'onboarding_completed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  // Retained for back-compat with OAuthButtons / legacy paths
  | 'step_started'
  | 'step_completed'
  | 'step_validation_error';

interface EmitOpts {
  step?: number;
  provider?: string;
  metadata?: Record<string, unknown>;
}

const SESSION_KEY = 'qg:signup:session_id';

function getOrCreateSessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Emit signup funnel events to public.signup_funnel_events.
 * Fire-and-forget. Never blocks the UI on analytics failure.
 */
export function useSignupFunnel() {
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  const emit = useCallback(async (event: FunnelEvent, opts: EmitOpts = {}) => {
    try {
      await supabase.from('signup_funnel_events').insert({
        session_id: sessionIdRef.current,
        event,
        step: opts.step ?? null,
        provider: opts.provider ?? null,
        metadata: opts.metadata ?? {},
      });
    } catch (err) {
      // Never break UX for analytics
      console.debug('signup funnel emit failed', event, err);
    }
  }, []);

  const reset = useCallback(() => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    sessionIdRef.current = getOrCreateSessionId();
  }, []);

  // eslint-disable-next-line react-hooks/refs -- session id is read during render to surface to consumers; the ref value only changes inside the reset() event handler.
  return { emit, sessionId: sessionIdRef.current, reset };
}
