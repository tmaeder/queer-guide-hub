import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve a bare root-level slug (/maldives, /berlin) to its canonical geo
 * detail route (/country/maldives, /city/berlin). Used by the 404 page so
 * hand-typed destination URLs land on the right page instead of a dead end.
 * Countries win over cities on a slug collision.
 *
 * Same plain-effect shape as useVenueSlugRedirect: no react-query dependency,
 * state only set from the async callback, stale results for a previous slug
 * are ignored.
 */
export function useGeoSlugRedirect(slug: string | null): string | null {
  const [resolved, setResolved] = useState<{ key: string; to: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: country } = await supabase
          .from('countries')
          .select('slug')
          .eq('slug', slug)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (country?.slug) {
          setResolved({ key: slug, to: `/country/${country.slug}` });
          return;
        }
        const { data: cities } = await supabase
          .from('cities')
          .select('slug')
          .eq('slug', slug)
          .is('duplicate_of_id', null)
          .limit(1);
        if (!cancelled && cities?.[0]?.slug) {
          setResolved({ key: slug, to: `/city/${cities[0].slug}` });
        }
      } catch {
        /* best-effort — no redirect on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return slug && resolved?.key === slug ? resolved.to : null;
}
