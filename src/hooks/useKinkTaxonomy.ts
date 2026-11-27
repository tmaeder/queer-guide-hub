import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { KinkCategory, KinkItem } from '@/lib/kinks/types';

export interface KinkTaxonomy {
  categories: KinkCategory[];
  items: KinkItem[];
  itemsByCategory: Map<string, KinkItem[]>;
}

/** A short cache lets backend vocabulary changes reach the checklist. */
export function useKinkTaxonomy(enabled = true) {
  return useQuery({
    queryKey: ['kink-taxonomy'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<KinkTaxonomy> => {
      const [cats, items] = await Promise.all([
        untypedFrom('kink_categories')
          .select('id, slug, label, label_i18n, description, description_i18n, axis, sort_order')
          .eq('is_active', true)
          .order('sort_order'),
        untypedFrom('kink_items')
          // `*` so a column added by a migration (glossary_tag_slug) cannot break the
          // read in the window before that migration has applied.
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      const categories = (cats.data ?? []) as unknown as KinkCategory[];
      const allItems = (items.data ?? []) as unknown as KinkItem[];
      const itemsByCategory = new Map<string, KinkItem[]>();
      const activeCategories = new Set(categories.map((category) => category.id));
      for (const item of allItems.filter((item) => activeCategories.has(item.category_id))) {
        const list = itemsByCategory.get(item.category_id) ?? [];
        list.push(item);
        itemsByCategory.set(item.category_id, list);
      }
      return {
        categories,
        items: allItems.filter((item) => activeCategories.has(item.category_id)),
        itemsByCategory,
      };
    },
  });
}
