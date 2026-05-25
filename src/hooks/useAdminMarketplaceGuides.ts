import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['marketplace_guides']['Row'];
type GuideInsert = Database['public']['Tables']['marketplace_guides']['Insert'];
type GuidePickRow = Database['public']['Tables']['marketplace_guide_picks']['Row'];
type GuidePickInsert = Database['public']['Tables']['marketplace_guide_picks']['Insert'];

export interface AdminPickWithListing extends GuidePickRow {
  listing: {
    id: string;
    slug: string;
    title: string;
    business_name: string;
    images: string[] | null;
    price: number | null;
    currency: string | null;
  } | null;
}

const KEYS = {
  list: () => ['admin-marketplace-guides-list'] as const,
  one: (id: string) => ['admin-marketplace-guide', id] as const,
};

export function useAdminGuidesList() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from('marketplace_guides')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminGuide(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.one(id) : ['admin-marketplace-guide', 'none'],
    queryFn: async (): Promise<{ guide: GuideRow; picks: AdminPickWithListing[] } | null> => {
      if (!id) return null;
      const [g, p] = await Promise.all([
        supabase.from('marketplace_guides').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('marketplace_guide_picks')
          .select(
            `*, listing:marketplace_listings(id, slug, title, business_name, images, price, currency)`,
          )
          .eq('guide_id', id)
          .order('tier', { ascending: true })
          .order('position', { ascending: true }),
      ]);
      if (g.error) throw g.error;
      if (!g.data) return null;
      if (p.error) throw p.error;
      return { guide: g.data, picks: (p.data ?? []) as unknown as AdminPickWithListing[] };
    },
    enabled: !!id,
  });
}

export function useUpsertGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuideInsert): Promise<GuideRow> => {
      const { data, error } = await supabase
        .from('marketplace_guides')
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      if (data?.id) qc.invalidateQueries({ queryKey: KEYS.one(data.id) });
    },
  });
}

export function useDeleteGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('marketplace_guides').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  });
}

export function useUpsertPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuidePickInsert): Promise<GuidePickRow> => {
      const { data, error } = await supabase
        .from('marketplace_guide_picks')
        .upsert(input, { onConflict: 'guide_id,listing_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.guide_id) qc.invalidateQueries({ queryKey: KEYS.one(data.guide_id) });
    },
  });
}

export function useDeletePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('marketplace_guide_picks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, _vars, _ctx) =>
      qc.invalidateQueries({ queryKey: ['admin-marketplace-guide'] }),
  });
}

/** Quick listing search for the pick-picker. */
export function useListingSearch(q: string) {
  return useQuery({
    queryKey: ['admin-marketplace-listing-search', q],
    queryFn: async () => {
      const term = q.trim();
      if (term.length < 2) return [];
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('id, slug, title, business_name, images, price, currency')
        .or(`title.ilike.%${term}%,business_name.ilike.%${term}%`)
        .eq('status', 'active')
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
    enabled: q.trim().length >= 2,
    staleTime: 30 * 1000,
  });
}

/** Publish gate — returns a list of human-readable blockers. */
export function publishBlockers(
  guide: GuideRow | null,
  picks: AdminPickWithListing[],
): string[] {
  if (!guide) return ['Guide not loaded'];
  const blockers: string[] = [];
  if (!guide.title?.trim()) blockers.push('Title is required');
  if (!guide.intro_md || guide.intro_md.trim().length < 80)
    blockers.push('Intro must be at least 80 characters');
  if (!guide.hero_image_path?.trim())
    blockers.push('Hero image is required (R2 path or absolute URL)');
  if (picks.length < 3) blockers.push(`At least 3 picks required (have ${picks.length})`);
  if (!picks.some((p) => p.tier === 'top')) blockers.push('At least one "top" pick required');
  return blockers;
}
