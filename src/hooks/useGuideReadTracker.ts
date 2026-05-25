import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const COMPLETE_AT_PCT = 90;
const UPDATE_THROTTLE_MS = 4000;

/**
 * Tracks a signed-in user's reading state on a guide page:
 *   - Inserts a marketplace_guide_reads row on mount.
 *   - Updates scroll_pct as they scroll (throttled to ~4s).
 *   - Auto-sets completed_at = now() the first time scroll_pct >= 90.
 *
 * Anonymous users are a no-op. Server enforces auth.uid() = user_id via RLS.
 * The Phase 3 scorer reads marketplace_guide_reads for the
 * "continue_reading" and "already_completed" signals.
 *
 * See docs/plans/2026-05-24-marketplace-redesign.md §5.
 */
export function useGuideReadTracker(guideId: string | undefined): void {
  const { user } = useAuth();
  const startedRef = useRef(false);
  const lastUpdateRef = useRef(0);
  const completedRef = useRef(false);
  const maxPctRef = useRef(0);

  useEffect(() => {
    if (!user || !guideId) return;

    let cancelled = false;
    startedRef.current = false;
    completedRef.current = false;
    maxPctRef.current = 0;

    void (async () => {
      const { error } = await supabase
        .from('marketplace_guide_reads')
        .upsert(
          {
            user_id: user.id,
            guide_id: guideId,
            started_at: new Date().toISOString(),
            scroll_pct: 0,
          },
          { onConflict: 'user_id,guide_id', ignoreDuplicates: false },
        );
      if (cancelled) return;
      if (!error) startedRef.current = true;
    })();

    const onScroll = () => {
      if (!startedRef.current || completedRef.current) return;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
      const pct = Math.min(100, Math.round((doc.scrollTop / max) * 100));
      if (pct <= maxPctRef.current) return;
      maxPctRef.current = pct;

      const now = Date.now();
      const shouldFlush =
        pct >= COMPLETE_AT_PCT || now - lastUpdateRef.current >= UPDATE_THROTTLE_MS;
      if (!shouldFlush) return;
      lastUpdateRef.current = now;

      const completing = pct >= COMPLETE_AT_PCT;
      if (completing) completedRef.current = true;

      void supabase
        .from('marketplace_guide_reads')
        .update({
          scroll_pct: pct,
          completed_at: completing ? new Date().toISOString() : null,
        })
        .eq('user_id', user.id)
        .eq('guide_id', guideId)
        // Don't clobber a prior completed_at if the user scrolls back up.
        .is('completed_at', null);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
    };
  }, [guideId, user]);
}
