import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve a (possibly renamed) venue slug to its current slug via
 * `venue_slug_redirects`. Used by the 404 page as a client-side fallback —
 * the edge middleware handles the SEO-correct 301 for direct/bot hits.
 * Returns the new slug, or null when there's no redirect.
 *
 * Deliberately uses a plain effect (not react-query) so the 404 page renders
 * even outside a QueryClientProvider (early-boot / isolated tests).
 */
export function useVenueSlugRedirect(oldSlug: string | null): string | null {
  const [newSlug, setNewSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!oldSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setNewSlug(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: redirect } = await supabase
          .from('venue_slug_redirects')
          .select('venue_id')
          .eq('old_slug', oldSlug)
          .maybeSingle();
        if (cancelled || !redirect?.venue_id) return;
        const { data: venue } = await supabase
          .from('venues')
          .select('slug')
          .eq('id', redirect.venue_id)
          .maybeSingle();
        if (!cancelled && venue?.slug) setNewSlug(venue.slug);
      } catch {
        /* best-effort — no redirect on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oldSlug]);

  return newSlug;
}
