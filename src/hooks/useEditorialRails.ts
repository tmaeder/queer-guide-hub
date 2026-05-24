import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EditorialEntityType = 'country' | 'city' | 'village';

export interface EditorialRail {
  id: string;
  slug: string;
  title: string;
  editor_note: string | null;
  entity_type: EditorialEntityType;
  cluster_id: string | null;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  status: 'draft' | 'published' | 'archived';
  items: Array<{ entity_id: string; position: number }>;
}

export function useEditorialRails() {
  return useQuery<EditorialRail[]>({
    queryKey: ['editorial-rails-published'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rails, error } = await supabase
        .from('editorial_rails')
        .select(
          'id, slug, title, editor_note, entity_type, cluster_id, position, starts_at, ends_at, status',
        )
        .eq('status', 'published')
        .order('position', { ascending: true });

      if (error || !rails || rails.length === 0) return [];

      const ids = rails.map((r) => r.id as string);
      const { data: items } = await supabase
        .from('editorial_rail_items')
        .select('rail_id, entity_id, position')
        .in('rail_id', ids)
        .order('position', { ascending: true });

      const byRail = new Map<string, Array<{ entity_id: string; position: number }>>();
      for (const it of items ?? []) {
        const row = it as { rail_id: string; entity_id: string; position: number };
        const arr = byRail.get(row.rail_id) ?? [];
        arr.push({ entity_id: row.entity_id, position: row.position });
        byRail.set(row.rail_id, arr);
      }

      return rails.map((r) => ({
        ...(r as Omit<EditorialRail, 'items'>),
        items: byRail.get(r.id as string) ?? [],
      }));
    },
  });
}
