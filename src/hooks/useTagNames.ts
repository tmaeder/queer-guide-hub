import { supabase } from '@/integrations/supabase/client';

/** Resolve unified_tags ids → names for display in the review queue. */
export async function fetchTagNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('unified_tags').select('id,name').in('id', ids);
  return Object.fromEntries((data ?? []).map((t) => [t.id, t.name]));
}
