import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FunnelEvent =
  | 'signup_landing_view'
  | 'oauth_start'
  | 'oauth_complete'
  | 'signup_validation_error'
  | 'signup_completed'
  | 'email_verified'
  | 'onboarding_skipped'
  | 'onboarding_completed'
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

  return { emit, sessionId: sessionIdRef.current, reset };
}
