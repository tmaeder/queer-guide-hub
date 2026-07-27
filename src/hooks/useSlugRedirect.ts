import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface SlugRedirectConfig {
  /** e.g. 'event_slug_redirects' */
  redirectTable: string;
  /** FK column on the redirect table pointing at the canonical row, e.g. 'event_id' */
  redirectIdColumn: string;
  /** Canonical entity table to read the CURRENT slug from, e.g. 'events' */
  entityTable: string;
}

/**
 * Generic merged-duplicate slug-redirect resolver — the parameterized sibling
 * of `useVenueSlugRedirect` for the other entity types whose merge core writes
 * a `<type>_slug_redirects` row (see `20260623123927`, `20260724222200`,
 * `20260724223631`). Callers gate `oldSlug` to only fire once the primary
 * detail fetch has confirmed not-found, matching the existing client-side
 * fallback pattern (the edge middleware handles the SEO-correct 301 for
 * direct/bot hits — this covers in-app SPA navigation).
 *
 * Returns the canonical row's CURRENT slug, or null when there's no redirect
 * (the common case) or `oldSlug` is null.
 */
export function useSlugRedirect(config: SlugRedirectConfig, oldSlug: string | null): string | null {
  const { redirectTable, redirectIdColumn, entityTable } = config;
  const [resolved, setResolved] = useState<{ key: string; slug: string } | null>(null);

  useEffect(() => {
    if (!oldSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: redirect } = await untypedFrom(redirectTable)
          .select(redirectIdColumn)
          .eq('old_slug', oldSlug)
          .maybeSingle();
        const canonicalId = (redirect as Record<string, unknown> | null)?.[redirectIdColumn] as
          | string
          | undefined;
        if (cancelled || !canonicalId) return;
        const { data: canon } = await untypedFrom(entityTable)
          .select('slug')
          .eq('id', canonicalId)
          .maybeSingle();
        const newSlug = (canon as { slug?: string } | null)?.slug;
        if (!cancelled && newSlug && newSlug !== oldSlug) setResolved({ key: oldSlug, slug: newSlug });
      } catch {
        /* best-effort — no redirect on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
    // config is a static literal per call site; only oldSlug varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldSlug]);

  // Derived: only surface a result that matches the current oldSlug.
  return oldSlug && resolved?.key === oldSlug ? resolved.slug : null;
}
