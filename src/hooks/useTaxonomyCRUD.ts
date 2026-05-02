import { supabase } from '@/integrations/supabase/client';

/**
 * DUP-4 hook for the simple admin taxonomy CRUD pattern shared across
 * event_amenities, event_services, event_types, venue_amenities,
 * venue_categories, venue_services, accessibility_attributes,
 * target_groups, etc.
 *
 * Keeps supabase.from() out of the page tree.
 */
export function useTaxonomyCRUD(table: string) {
  return {
    async upsert<T extends Record<string, unknown>>(
      form: T,
      editingId: string | null,
    ): Promise<{ error: Error | null }> {
      if (editingId) {
        const { error } = await supabase
          .from(table as never)
          .update(form as never)
          .eq('id' as never, editingId as never);
        return { error: error as Error | null };
      }
      const { error } = await supabase
        .from(table as never)
        .insert([form] as never);
      return { error: error as Error | null };
    },
    async remove(id: string): Promise<{ error: Error | null }> {
      const { error } = await supabase
        .from(table as never)
        .delete()
        .eq('id' as never, id as never);
      return { error: error as Error | null };
    },
  };
}
