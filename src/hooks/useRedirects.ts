import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ── Types ───────────────────────────────────────────────────────────────────

export type RedirectType = 'SHORT' | 'PATH';
export type MatchKind = 'EXACT' | 'WILDCARD' | 'REGEX';
export type QueryMode = 'PRESERVE' | 'DROP' | 'OVERRIDE';

export interface Redirect {
  id: string;
  type: RedirectType;
  slug: string | null;
  source_path: string | null;
  match_kind: MatchKind;
  target: string;
  status_code: number;
  is_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  preserve_query: boolean;
  query_mode: QueryMode;
  query_override: Record<string, string> | null;
  utm_defaults: Record<string, string> | null;
  click_limit: number | null;
  click_count: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RedirectFormData {
  type: RedirectType;
  slug?: string;
  source_path?: string;
  match_kind: MatchKind;
  target: string;
  status_code: number;
  is_enabled: boolean;
  start_at?: string | null;
  end_at?: string | null;
  query_mode: QueryMode;
  query_override?: Record<string, string> | null;
  utm_defaults?: Record<string, string> | null;
  click_limit?: number | null;
  notes?: string;
}

export interface RedirectEvent {
  id: number;
  redirect_id: string;
  ts: string;
  referer: string | null;
  user_agent: string | null;
  country: string | null;
  path: string;
  query: string | null;
  status: number;
}

export interface RedirectFilters {
  search?: string;
  type?: RedirectType | '';
  is_enabled?: boolean | null;
  status_code?: number | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRedirects() {
  const { user } = useAuth();
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchRedirects = useCallback(async (
    filters: RedirectFilters = {},
    page = 0,
    pageSize = 25,
    sortField = 'updated_at',
    sortDir: 'asc' | 'desc' = 'desc',
  ) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('redirects' as any)
        .select('*', { count: 'exact' });

      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.is_enabled !== null && filters.is_enabled !== undefined) {
        query = query.eq('is_enabled', filters.is_enabled);
      }
      if (filters.status_code) {
        query = query.eq('status_code', filters.status_code);
      }
      if (filters.search) {
        // Search across slug, source_path, target, and notes
        query = query.or(
          `slug.ilike.%${filters.search}%,source_path.ilike.%${filters.search}%,target.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`
        );
      }

      query = query
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;
      setRedirects((data || []) as unknown as Redirect[]);
      setTotal(count || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch redirects');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRedirect = useCallback(async (formData: RedirectFormData): Promise<Redirect | null> => {
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from('redirects' as any)
        .insert({
          ...formData,
          preserve_query: formData.query_mode === 'PRESERVE',
          created_by: user?.id || null,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data as unknown as Redirect;
    } catch (err: any) {
      setError(err.message || 'Failed to create redirect');
      return null;
    }
  }, [user]);

  const updateRedirect = useCallback(async (
    id: string,
    formData: Partial<RedirectFormData>,
  ): Promise<Redirect | null> => {
    setError(null);
    try {
      const updatePayload: any = { ...formData };
      if (formData.query_mode !== undefined) {
        updatePayload.preserve_query = formData.query_mode === 'PRESERVE';
      }
      const { data, error: updateError } = await supabase
        .from('redirects' as any)
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data as unknown as Redirect;
    } catch (err: any) {
      setError(err.message || 'Failed to update redirect');
      return null;
    }
  }, []);

  const deleteRedirect = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('redirects' as any)
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete redirect');
      return false;
    }
  }, []);

  const toggleEnabled = useCallback(async (id: string, is_enabled: boolean): Promise<boolean> => {
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('redirects' as any)
        .update({ is_enabled } as any)
        .eq('id', id);

      if (updateError) throw updateError;
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to toggle redirect');
      return false;
    }
  }, []);

  const fetchEvents = useCallback(async (
    redirectId: string,
    limit = 20,
  ): Promise<RedirectEvent[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('redirect_events' as any)
        .select('*')
        .eq('redirect_id', redirectId)
        .order('ts', { ascending: false })
        .limit(limit);

      if (fetchError) throw fetchError;
      return (data || []) as unknown as RedirectEvent[];
    } catch {
      return [];
    }
  }, []);

  // Bulk import from CSV-like array of objects
  const bulkImport = useCallback(async (
    items: Array<{
      slug?: string;
      source_path?: string;
      target: string;
      status_code?: number;
      is_enabled?: boolean;
      type?: RedirectType;
    }>,
  ): Promise<{ success: number; errors: string[] }> => {
    const errors: string[] = [];
    let success = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const type: RedirectType = item.type || (item.slug ? 'SHORT' : 'PATH');
        const { error: insertError } = await supabase
          .from('redirects' as any)
          .insert({
            type,
            slug: type === 'SHORT' ? item.slug?.toLowerCase().trim() : null,
            source_path: type === 'PATH' ? item.source_path?.trim() : null,
            target: item.target.trim(),
            status_code: item.status_code || 301,
            is_enabled: item.is_enabled !== false,
            match_kind: 'EXACT',
            query_mode: 'PRESERVE',
            preserve_query: true,
            created_by: user?.id || null,
          } as any);

        if (insertError) {
          errors.push(`Row ${i + 1}: ${insertError.message}`);
        } else {
          success++;
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return { success, errors };
  }, [user]);

  // Export all redirects as CSV-ready objects
  const exportAll = useCallback(async (): Promise<Redirect[]> => {
    const { data, error: fetchError } = await supabase
      .from('redirects' as any)
      .select('*')
      .order('updated_at', { ascending: false });

    if (fetchError) throw fetchError;
    return (data || []) as unknown as Redirect[];
  }, []);

  return {
    redirects,
    loading,
    total,
    error,
    fetchRedirects,
    createRedirect,
    updateRedirect,
    deleteRedirect,
    toggleEnabled,
    fetchEvents,
    bulkImport,
    exportAll,
  };
}
