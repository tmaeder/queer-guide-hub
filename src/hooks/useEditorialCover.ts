import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EditorialEntityType } from '@/hooks/useEditorialRails';

export interface EditorialCover {
  id: string;
  entity_type: EditorialEntityType;
  entity_id: string;
  headline: string;
  pull_quote: string | null;
  hero_image_url: string | null;
  author: string | null;
  starts_at: string;
}

export function useEditorialCover() {
  return useQuery<EditorialCover | null>({
    queryKey: ['editorial-cover-current'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('current_editorial_cover');
      if (error) return null;
      const rows = data as EditorialCover[] | null;
      return rows && rows.length > 0 ? rows[0] : null;
    },
  });
}
