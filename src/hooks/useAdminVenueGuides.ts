import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['venue_guides']['Row'];
type GuideInsert = Database['public']['Tables']['venue_guides']['Insert'];
type PickRow = Database['public']['Tables']['venue_guide_picks']['Row'];
type PickInsert = Database['public']['Tables']['venue_guide_picks']['Insert'];

export interface AdminVenuePickWithVenue extends PickRow {
  venue: {
    id: string;
    slug: string;
    name: string;
    category: string | null;
    city: string | null;
    images: string[] | null;
  } | null;
}

const KEYS = {
  list: () => ['admin-venue-guides-list'] as const,
  one: (id: string) => ['admin-venue-guide', id] as const,
};

export function useAdminVenueGuidesList() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from('venue_guides')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminVenueGuide(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.one(id) : ['admin-venue-guide', 'none'],
    queryFn: async (): Promise<{ guide: GuideRow; picks: AdminVenuePickWithVenue[] } | null> => {
      if (!id) return null;
      const [g, p] = await Promise.all([
        supabase.from('venue_guides').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('venue_guide_picks')
          .select(`*, venue:venues(id, slug, name, category, city, images)`)
          .eq('guide_id', id)
          .order('tier', { ascending: true })
          .order('position', { ascending: true }),
      ]);
      if (g.error) throw g.error;
      if (!g.data) return null;
      if (p.error) throw p.error;
      return { guide: g.data, picks: (p.data ?? []) as unknown as AdminVenuePickWithVenue[] };
    },
    enabled: !!id,
  });
}

export function useUpsertVenueGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuideInsert): Promise<GuideRow> => {
      const { data, error } = await supabase
        .from('venue_guides')
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

export function useUpsertVenuePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PickInsert): Promise<PickRow> => {
      const { data, error } = await supabase
        .from('venue_guide_picks')
        .upsert(input, { onConflict: 'guide_id,venue_id' })
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

export function useDeleteVenuePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('venue_guide_picks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-venue-guide'] }),
  });
}

export function useVenueSearch(q: string) {
  return useQuery({
    queryKey: ['admin-venue-search', q],
    queryFn: async () => {
      const term = q.trim();
      if (term.length < 2) return [];
      const { data, error } = await supabase
        .from('venues')
        .select('id, slug, name, category, city, images')
        .or(`name.ilike.%${term}%`)
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
    enabled: q.trim().length >= 2,
    staleTime: 30 * 1000,
  });
}

export function venueGuidePublishBlockers(
  guide: GuideRow | null,
  picks: AdminVenuePickWithVenue[],
): string[] {
  if (!guide) return ['Guide not loaded'];
  const blockers: string[] = [];
  if (!guide.title?.trim()) blockers.push('Title is required');
  if (!guide.intro_md || guide.intro_md.trim().length < 80)
    blockers.push('Intro must be at least 80 characters');
  if (!guide.hero_image_path?.trim())
    blockers.push('Hero image is required (R2 path or absolute URL)');
  if (picks.length < 2) blockers.push(`At least 2 picks required (have ${picks.length})`);
  if (!picks.some((p) => p.tier === 'top'))
    blockers.push('At least one "top" pick required');
  return blockers;
}
