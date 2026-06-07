// Lightweight helper to record manual admin edits to geo entities (cities, countries).
// Writes to public.ingestion_events so all manual/automated provenance lives in one audit stream.
// Never throws — audit failures must not break admin workflows.
import { supabase } from '@/integrations/supabase/client';

type GeoTable = 'cities' | 'countries' | 'venues' | 'events' | 'personalities' | 'marketplace_listings';
type Action = 'create' | 'update' | 'delete';

/**
 * Record an admin edit into cms_audit_log — the stream the /admin/audit viewer
 * and per-entity history read. Best-effort (never throws). Closes the coverage
 * gap where bulk data-table edits/deletes previously left no trail. Caps rows
 * per call so a huge bulk op can't flood the table.
 */
export async function logCmsAudit(
  sourceTable: string,
  sourceIds: string[],
  action: string,
): Promise<void> {
  try {
    if (sourceIds.length === 0) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const timestamp = new Date().toISOString();
    const rows = sourceIds.slice(0, 200).map((id) => ({
      source_table: sourceTable,
      source_id: id,
      action,
      actor_id: user?.id ?? null,
      timestamp,
    }));
    await supabase.from('cms_audit_log' as 'venues').insert(rows as never);
  } catch {
    // best-effort
  }
}

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
