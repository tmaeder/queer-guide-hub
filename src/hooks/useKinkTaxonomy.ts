import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { KinkCategory, KinkItem } from '@/lib/kinks/types';

export interface KinkTaxonomy {
  categories: KinkCategory[];
  items: KinkItem[];
  itemsByCategory: Map<string, KinkItem[]>;
}

/** Static per version — cache indefinitely for the session. */
export function useKinkTaxonomy(enabled = true) {
  return useQuery({
    queryKey: ['kink-taxonomy'],
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<KinkTaxonomy> => {
      const [cats, items] = await Promise.all([
        untypedFrom('kink_categories')
          .select('id, slug, label, label_i18n, description, description_i18n, axis, sort_order')
          .order('sort_order'),
        untypedFrom('kink_items')
          .select(
            'id, category_id, slug, label, label_i18n, description, description_i18n, axis_override, discussion_recommended, sort_order',
          )
          .order('sort_order'),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      const categories = (cats.data ?? []) as unknown as KinkCategory[];
      const allItems = (items.data ?? []) as unknown as KinkItem[];
      const itemsByCategory = new Map<string, KinkItem[]>();
      for (const item of allItems) {
        const list = itemsByCategory.get(item.category_id) ?? [];
        list.push(item);
        itemsByCategory.set(item.category_id, list);
      }
      return { categories, items: allItems, itemsByCategory };
    },
  });
}
