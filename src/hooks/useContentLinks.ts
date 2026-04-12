import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type ContentLink = Database['public']['Tables']['content_links']['Row'] & {
  is_social?: boolean;
  is_scraped_source?: boolean;
  scan_id?: string | null;
  scan_verdict?: string | null;
  scan_score?: number | null;
  scan_categories?: string[] | null;
  scan_screenshot_url?: string | null;
  scan_brands?: string[] | null;
  scanned_at?: string | null;
  auto_removed_at?: string | null;
};

export interface LinkHealthStats {
  total: number;
  ok: number;
  broken: number;
  redirect: number;
  pending: number;
  blocked: number;
  timeout: number;
  dismissed: number;
  malicious: number;
  suspicious: number;
  auto_removed: number;
}

export function useContentLinks() {
  const [links, setLinks] = useState<ContentLink[]>([]);
  const [stats, setStats] = useState<LinkHealthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFilters = useRef<{ status?: string; content_type?: string; limit?: number } | undefined>();

  const fetchLinks = useCallback(async (filters?: {
    status?: string;
    content_type?: string;
    limit?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);
      lastFilters.current = filters;
      let query = supabase
        .from('content_links')
        .select('*')
        .order('last_checked_at', { ascending: true, nullsFirst: true });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.content_type) query = query.eq('content_type', filters.content_type);
      query = query.limit(filters?.limit ?? 200);

      const { data, error: err } = await query;
      if (err) throw err;
      setLinks(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch links');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('get_link_health_stats');
      if (err) throw err;
      const d = data as Record<string, number> | null;
      setStats({
        total: d?.total ?? 0,
        ok: d?.ok ?? 0,
        broken: d?.broken ?? 0,
        redirect: d?.redirect ?? 0,
        pending: d?.pending ?? 0,
        blocked: d?.blocked ?? 0,
        timeout: d?.timeout ?? 0,
        dismissed: d?.dismissed ?? 0,
        malicious: d?.malicious ?? 0,
        suspicious: d?.suspicious ?? 0,
        auto_removed: d?.auto_removed ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch stats');
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchStats(), fetchLinks(lastFilters.current)]);
  }, [fetchStats, fetchLinks]);

  // --- Mutations ---

  const deleteLink = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('content_links').delete().eq('id', id);
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const deleteBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { error: err } = await supabase.from('content_links').delete().in('id', ids);
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const dismissLink = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('content_links')
      .update({ status: 'DISMISSED' })
      .eq('id', id);
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const dismissBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { error: err } = await supabase
      .from('content_links')
      .update({ status: 'DISMISSED' })
      .in('id', ids);
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const recheckLink = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('validate-links', {
      body: { mode: 'single', link_ids: [id] },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    await refresh();
    return resp.data;
  }, [refresh]);

  const recheckBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('validate-links', {
      body: { mode: 'single', link_ids: ids },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    await refresh();
    return resp.data;
  }, [refresh]);

  const validateLinks = useCallback(async (batchLimit = 50) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('validate-links', {
      body: { mode: 'validate', batch_limit: batchLimit },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    await refresh();
    return resp.data as { checked?: number; recovered?: number; still_broken?: number; auto_removed?: number; errors?: number } | undefined;
  }, [refresh]);

  const updateSourceUrl = useCallback(async (link: ContentLink, newUrl: string) => {
    // 1. Update the source content table (e.g. venues.website, events.ticket_url)
    const { error: srcErr } = await supabase
      .from(link.content_type as 'venues')
      .update({ [link.field_name]: newUrl })
      .eq('id', link.content_id);
    if (srcErr) throw srcErr;

    // 2. Update the content_links row
    const { error: linkErr } = await supabase
      .from('content_links')
      .update({ original_url: newUrl, status: 'PENDING', last_checked_at: null, http_status: null })
      .eq('id', link.id);
    if (linkErr) throw linkErr;

    await refresh();
  }, [refresh]);

  const applyRedirect = useCallback(async (link: ContentLink) => {
    if (!link.final_url) throw new Error('No redirect URL available');

    // 1. Update source content to use the final URL
    const { error: srcErr } = await supabase
      .from(link.content_type as 'venues')
      .update({ [link.field_name]: link.final_url })
      .eq('id', link.content_id);
    if (srcErr) throw srcErr;

    // 2. Update content_links to reflect the new URL and mark OK
    const { error: linkErr } = await supabase
      .from('content_links')
      .update({ original_url: link.final_url, status: 'OK', last_checked_at: new Date().toISOString() })
      .eq('id', link.id);
    if (linkErr) throw linkErr;

    await refresh();
  }, [refresh]);

  const applyRedirectBulk = useCallback(async (linksToApply: ContentLink[]) => {
    for (const link of linksToApply) {
      if (!link.final_url) continue;
      await supabase
        .from(link.content_type as 'venues')
        .update({ [link.field_name]: link.final_url })
        .eq('id', link.content_id);
      await supabase
        .from('content_links')
        .update({ original_url: link.final_url, status: 'OK', last_checked_at: new Date().toISOString() })
        .eq('id', link.id);
    }
    await refresh();
  }, [refresh]);

  const scanLink = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('scan-links', {
      body: { link_ids: [id] },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    const result = resp.data as { scanned?: number; errors?: number; results?: Record<string, unknown>[] } | undefined;
    if (result?.errors && result.errors > 0 && result.scanned === 0) {
      const firstErr = result.results?.[0]?.error;
      throw new Error(firstErr ?? 'Scan failed — check edge function logs');
    }
    await refresh();
    return result;
  }, [refresh]);

  const scanBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('scan-links', {
      body: { link_ids: ids },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    const result = resp.data as { scanned?: number; errors?: number; results?: Record<string, unknown>[] } | undefined;
    await refresh();
    return result;
  }, [refresh]);

  const scanBatch = useCallback(async (batchLimit = 10) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke('scan-links', {
      body: { batch: true, batch_limit: batchLimit },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (resp.error) throw resp.error;
    const result = resp.data as { scanned?: number; errors?: number; results?: Record<string, unknown>[] } | undefined;
    await refresh();
    return result;
  }, [refresh]);

  return {
    links, stats, loading, error,
    fetchLinks, fetchStats, refresh,
    deleteLink, deleteBulk,
    dismissLink, dismissBulk,
    recheckLink, recheckBulk, validateLinks,
    updateSourceUrl, applyRedirect, applyRedirectBulk,
    scanLink, scanBulk, scanBatch,
  };
}
