import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * /places editor rails, served by the unified guides table (format='list')
 * since the editorial_rails fold-in. The public shape is unchanged so
 * EditorRail/Places render as before; rail placement metadata lives in
 * guides.meta (rail_position, cluster_id).
 */

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

const PICK_TO_RAIL_TYPE: Record<string, EditorialEntityType> = {
  country: 'country',
  city: 'city',
  queer_village: 'village',
};

interface ListGuideRow {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  primary_entity_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  meta: { rail_position?: number; cluster_id?: string | null } | null;
}

export function useEditorialRails() {
  return useQuery<EditorialRail[]>({
    queryKey: ['editorial-rails-published'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rails, error } = await untypedFrom('guides')
        .select('id, slug, title, dek, primary_entity_type, starts_at, ends_at, status, meta')
        .eq('format', 'list')
        .eq('status', 'published');

      if (error || !rails || rails.length === 0) return [];

      // Display window (formerly enforced by the editorial_rails RLS policy).
      const now = Date.now();
      const visible = (rails as ListGuideRow[]).filter(
        (r) =>
          (!r.starts_at || new Date(r.starts_at).getTime() <= now) &&
          (!r.ends_at || new Date(r.ends_at).getTime() > now),
      );
      if (visible.length === 0) return [];

      const ids = visible.map((r) => r.id);
      const { data: items } = await untypedFrom('guide_picks')
        .select('guide_id, entity_id, position')
        .in('guide_id', ids)
        .eq('is_orphaned', false)
        .order('position', { ascending: true });

      const byRail = new Map<string, Array<{ entity_id: string; position: number }>>();
      for (const it of items ?? []) {
        const row = it as { guide_id: string; entity_id: string; position: number };
        const arr = byRail.get(row.guide_id) ?? [];
        arr.push({ entity_id: row.entity_id, position: row.position });
        byRail.set(row.guide_id, arr);
      }

      return visible
        .map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          editor_note: r.dek,
          entity_type: PICK_TO_RAIL_TYPE[r.primary_entity_type ?? ''] ?? 'city',
          cluster_id: r.meta?.cluster_id ?? null,
          position: r.meta?.rail_position ?? 0,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          status: r.status as EditorialRail['status'],
          items: byRail.get(r.id) ?? [],
        }))
        .sort((a, b) => a.position - b.position);
    },
  });
}
