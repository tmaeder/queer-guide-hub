// /culture: the historic queer symbols in cultural_nodes. Only standard-sensitivity
// historic symbols are read; flags live on /tags/c/symbols-flags, the hanky code is
// adult, and the wayfinding entries are app icons, not culture.
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface CulturalSymbol {
  slug: string;
  name: string;
  era: string | null;
  meaning: string | null;
  /** Active glossary entry with the same slug, when one exists. */
  glossarySlug: string | null;
}

export function useCulturalSymbols() {
  return useQuery({
    queryKey: ['cultural-symbols'],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<CulturalSymbol[]> => {
      const { data, error } = await untypedFrom('cultural_nodes')
        .select('slug, name, era_label, description')
        .eq('status', 'published')
        .eq('artifact_kind', 'historic_symbol')
        .eq('sensitivity', 'standard')
        .order('name');
      if (error) throw error;
      const nodes = (data ?? []) as {
        slug: string;
        name: string;
        era_label: string | null;
        description: string | null;
      }[];
      if (nodes.length === 0) return [];

      // A missing glossary link only costs a link, so a failed read is not fatal.
      const { data: tags } = await untypedFrom('unified_tags')
        .select('slug')
        .eq('status', 'active')
        .in(
          'slug',
          nodes.map((n) => n.slug),
        );
      const live = new Set(((tags ?? []) as { slug: string }[]).map((t) => t.slug));

      return nodes.map((n) => ({
        slug: n.slug,
        name: n.name,
        era: n.era_label,
        meaning: n.description,
        glossarySlug: live.has(n.slug) ? n.slug : null,
      }));
    },
  });
}
