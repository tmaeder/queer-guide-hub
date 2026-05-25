import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['event_guides']['Row'];
type PickRow = Database['public']['Tables']['event_guide_picks']['Row'];
type EventRow = Database['public']['Tables']['events']['Row'];

export type EventPickWithEvent = PickRow & {
  event: Pick<
    EventRow,
    'id' | 'slug' | 'title' | 'description' | 'images' | 'event_type' | 'start_date' | 'end_date' | 'city' | 'city_id'
  > | null;
};

export interface EventGuideDetail {
  guide: GuideRow;
  picks: EventPickWithEvent[];
}

const TIER_ORDER: Record<PickRow['tier'], number> = {
  top: 0, also_great: 1, upgrade: 2, budget: 3, avoid: 4,
};

export function useEventGuide(slug: string | undefined) {
  return useQuery({
    queryKey: ['event-guide', slug],
    queryFn: async (): Promise<EventGuideDetail | null> => {
      if (!slug) return null;
      const { data: guide, error: gerr } = await supabase
        .from('event_guides')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (gerr) throw gerr;
      if (!guide) return null;

      const { data: picks, error: perr } = await supabase
        .from('event_guide_picks')
        .select(`*, event:events(id, slug, title, description, images, event_type, start_date, end_date, city, city_id)`)
        .eq('guide_id', guide.id);
      if (perr) throw perr;

      const sorted = ((picks ?? []) as unknown as EventPickWithEvent[]).slice().sort((a, b) => {
        const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        return t !== 0 ? t : a.position - b.position;
      });
      return { guide, picks: sorted };
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEventGuidesIndex() {
  return useQuery({
    queryKey: ['event-guides-index'],
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from('event_guides')
        .select('*')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
