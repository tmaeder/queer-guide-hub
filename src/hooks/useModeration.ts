import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type ModerationFlag = Database['public']['Tables']['moderation_flags']['Row'];
type ModerationFlagInsert = Database['public']['Tables']['moderation_flags']['Insert'];

export interface CreateFlagParams {
  content_type: string;
  content_id: string;
  flag_type: 'REVIEW' | 'CORRECTION' | 'DELETE_REQUEST' | 'LINK_ISSUE' | 'DUPLICATE' | 'OTHER';
  reason: string;
  suggested_changes?: Record<string, unknown>;
}

export interface ModerationFilters {
  status?: string;
  flag_type?: string;
  content_type?: string;
  source?: string;
}

export function useModeration() {
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const createFlag = useCallback(async (params: CreateFlagParams) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-moderation-flag', {
        body: params,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return { success: true, flag: data.flag };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create report' };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFlags = useCallback(async (
    filters: ModerationFilters = {},
    page = 0,
    pageSize = 20,
  ) => {
    setLoading(true);
    try {
      let query = supabase
        .from('moderation_flags')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.flag_type) query = query.eq('flag_type', filters.flag_type);
      if (filters.content_type) query = query.eq('content_type', filters.content_type);
      if (filters.source) query = query.eq('source', filters.source);

      const { data, error, count } = await query;
      if (error) throw error;

      setFlags(data || []);
      setTotalCount(count || 0);
      return data || [];
    } catch (error) {
      console.error('Error fetching moderation flags:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFlagStatus = useCallback(async (
    flagId: string,
    status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED',
    resolution_note?: string,
  ) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'RESOLVED' || status === 'REJECTED') {
        updates.resolved_by = user?.id || null;
        updates.resolved_at = new Date().toISOString();
        if (resolution_note) updates.resolution_note = resolution_note;
      }

      const { data, error } = await supabase
        .from('moderation_flags')
        .update(updates)
        .eq('id', flagId)
        .select()
        .single();

      if (error) throw error;
      setFlags(prev => prev.map(f => f.id === flagId ? data : f));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkUpdateFlags = useCallback(async (
    flagIds: string[],
    status: 'RESOLVED' | 'REJECTED',
    resolution_note?: string,
  ) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = {
        status,
        resolved_by: user?.id || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (resolution_note) updates.resolution_note = resolution_note;

      const { error } = await supabase
        .from('moderation_flags')
        .update(updates)
        .in('id', flagIds);

      if (error) throw error;
      setFlags(prev => prev.map(f =>
        flagIds.includes(f.id) ? { ...f, ...updates } as ModerationFlag : f
      ));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { flags, totalCount, loading, createFlag, fetchFlags, updateFlagStatus, bulkUpdateFlags };
}
