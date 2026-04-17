// Lightweight helper to record manual admin edits to geo entities (cities, countries).
// Writes to public.ingestion_events so all manual/automated provenance lives in one audit stream.
// Never throws — audit failures must not break admin workflows.
import { supabase } from '@/integrations/supabase/client';

type GeoTable = 'cities' | 'countries' | 'venues' | 'events' | 'personalities' | 'marketplace_listings';
type Action = 'create' | 'update' | 'delete';

export async function logAdminGeoEdit(
  table: GeoTable,
  action: Action,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('ingestion_events').insert({
      stage: 'admin_edit',
      new_status: action,
      actor: user?.email ?? user?.id ?? 'admin-ui',
      payload: { table, entity_id: entityId, action, before, after },
    });
  } catch {
    // best-effort
  }
}
