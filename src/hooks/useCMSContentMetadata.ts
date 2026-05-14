import { supabase } from '@/integrations/supabase/client';
import type { WorkflowState, VisibilityLevel } from '@/types/cms';

export async function insertContentActions(
  rows: Array<Record<string, unknown>>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('content_actions' as 'events')
    .insert(rows as never);
  return { error: error ? { message: error.message } : null };
}

export interface CMSContentMetadata {
  workflow_state: WorkflowState;
  visibility_level: VisibilityLevel;
  published_at: string | null;
  scheduled_publish_at: string | null;
}

export async function fetchCMSReviewQueueMetadata<T = unknown>(): Promise<T[]> {
  const { data, error } = await supabase
    .from('cms_content_metadata' as 'events')
    .select('*')
    .eq('workflow_state', 'review')
    .order('last_edited_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function fetchRecordTitle(
  table: string,
  primaryKey: string,
  id: string,
  titleField: string,
): Promise<unknown> {
  const { data } = await supabase
    .from(table as 'events')
    .select(titleField)
    .eq(primaryKey, id)
    .single();
  return data;
}

export async function loadCMSContentMetadata(
  sourceTable: string,
  sourceId: string,
): Promise<Partial<CMSContentMetadata> | null> {
  const { data } = await supabase
    .from('cms_content_metadata' as const)
    .select('workflow_state, visibility_level, published_at, scheduled_publish_at')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle();
  return (data as Partial<CMSContentMetadata> | null) ?? null;
}

export async function upsertCMSContentMetadata(
  sourceTable: string,
  sourceId: string,
  patch: Partial<CMSContentMetadata> & { last_edited_at?: string },
): Promise<{ error: { message: string } | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('cms_content_metadata' as const).upsert(
    {
      source_table: sourceTable,
      source_id: sourceId,
      ...patch,
      updated_at: now,
      created_at: now,
    },
    { onConflict: 'source_table,source_id' },
  );
  return { error: error ? { message: error.message } : null };
}
