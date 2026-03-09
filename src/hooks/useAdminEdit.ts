import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';

interface EditLogEntry {
  id: string;
  content_type: string;
  content_id: string;
  editor_id: string;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  changed_fields: string[];
  created_at: string;
}

export function useAdminEdit() {
  const [loading, setLoading] = useState(false);

  const editContent = useCallback(async (
    contentType: string,
    contentId: string,
    changes: Record<string, unknown>,
  ) => {
    setLoading(true);
    try {
      // 1. Fetch current row for before_data snapshot
      const { data: before, error: fetchErr } = await api
        .from(contentType as any)
        .select('*')
        .eq('id', contentId)
        .single();

      if (fetchErr) throw new Error(`Failed to fetch current data: ${fetchErr.message}`);

      // 2. Update the target table directly
      const { data: record, error: updateErr } = await api
        .from(contentType as any)
        .update(changes)
        .eq('id', contentId)
        .select()
        .single();

      if (updateErr) throw new Error(`Failed to update: ${updateErr.message}`);

      // 3. Insert audit log entry
      const { data: { user } } = await api.auth.getUser();
      if (user) {
        await api.from('admin_edit_log').insert({
          content_type: contentType,
          content_id: contentId,
          editor_id: user.id,
          before_data: before as any,
          after_data: record as any,
          changed_fields: Object.keys(changes),
        });
      }

      return { success: true, record };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to save changes' };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEditLog = useCallback(async (
    contentType: string,
    contentId: string,
  ): Promise<EditLogEntry[]> => {
    try {
      const { data, error } = await api
        .from('admin_edit_log')
        .select('*')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as EditLogEntry[];
    } catch (error) {
      console.error('Error fetching edit log:', error);
      return [];
    }
  }, []);

  return { loading, editContent, fetchEditLog };
}
