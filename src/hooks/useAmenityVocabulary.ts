import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AmenityTerm {
  slug: string;
  name: string;
  icon_name: string | null;
  kind: 'amenity' | 'accessibility' | 'queer';
  category_scope: string[];
}

// Module-level cache — the controlled vocabulary is small and stable; fetch once
// and share across every consumer. Plain useState (no react-query) so the hook
// works in components mounted without a QueryClientProvider (e.g. VenueFilters).
let cache: Map<string, AmenityTerm> | null = null;
let inflight: Promise<Map<string, AmenityTerm>> | null = null;

async function loadVocabulary(): Promise<Map<string, AmenityTerm>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from('amenities')
        .select('slug, name, icon_name, kind, category_scope')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const map = new Map<string, AmenityTerm>();
      for (const r of (data ?? []) as AmenityTerm[]) map.set(r.slug, r);
      cache = map;
      return map;
    })();
  }
  return inflight;
}

/** The controlled amenity/accessibility/queer vocabulary (public.amenities). */
export function useAmenityVocabulary() {
  const [vocab, setVocab] = useState<Map<string, AmenityTerm> | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let active = true;
    loadVocabulary()
      .then((m) => { if (active) { setVocab(m); setLoading(false); } })
      .catch((e) => { console.error('Error fetching amenity vocabulary:', e); if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { vocab, loading };
}
