import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ScrapeSource {
  id: string;
  slug: string;
  name: string;
  url: string;
  content_type: string;
  target_table: string;
  scrape_method: string;
  scrape_config: Record<string, unknown>;
  schedule_interval_hours: number;
  is_enabled: boolean;
  priority: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  total_runs: number;
  total_items_fetched: number;
  consecutive_failures: number;
  rate_limit_ms: number;
  max_pages_per_run: number;
  created_at: string;
  updated_at: string;
}

export interface ScrapeRun {
  id: string;
  source_id: string;
  job_id: string | null;
  status: string;
  pages_crawled: number;
  items_found: number;
  items_staged: number;
  items_new: number;
  items_duplicate: number;
  items_error: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  run_log: unknown[];
  created_at: string;
}

export function useScrapeSourcesManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const fetchSources = useCallback(async (): Promise<ScrapeSource[]> => {
    try {
      const { data, error } = await supabase
        .from('scrape_sources')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ScrapeSource[];
    } catch (error) {
      console.error('Failed to fetch scrape sources:', error);
      return [];
    }
  }, []);

  const fetchRuns = useCallback(async (sourceId?: string, limit = 20): Promise<ScrapeRun[]> => {
    try {
      let query = supabase
        .from('scrape_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ScrapeRun[];
    } catch (error) {
      console.error('Failed to fetch scrape runs:', error);
      return [];
    }
  }, []);

  const toggleSource = useCallback(
    async (sourceId: string, enabled: boolean) => {
      try {
        const { error } = await supabase
          .from('scrape_sources')
          .update({ is_enabled: enabled })
          .eq('id', sourceId);
        if (error) throw error;
        toast({
          title: enabled ? 'Source enabled' : 'Source disabled',
          description: `Scraping source has been ${enabled ? 'enabled' : 'disabled'}.`,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to toggle source: ${(error as Error).message}`,
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const triggerScrape = useCallback(
    async (source: ScrapeSource, dryRun = false) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('scrape-web-sources', {
          body: { source_slug: source.slug, dry_run: dryRun },
        });

        if (error) throw error;

        const result = data?.results?.[0];
        toast({
          title: dryRun ? 'Dry Run Complete' : 'Scrape Complete',
          description: result
            ? `Found ${result.items_found} items, staged ${result.items_staged} from ${source.name}`
            : `Scrape of ${source.name} completed`,
        });

        return data;
      } catch (error) {
        toast({
          title: 'Scrape Failed',
          description: `Failed to scrape ${source.name}: ${(error as Error).message}`,
          variant: 'destructive',
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const triggerAllDue = useCallback(
    async (contentTypes?: string[]) => {
      setLoading(true);
      try {
        const body: Record<string, unknown> = { mode: 'scheduled' };
        if (contentTypes) body.content_types = contentTypes;

        const { data, error } = await supabase.functions.invoke('scrape-web-sources', { body });
        if (error) throw error;

        toast({
          title: 'Scheduled Scrape Complete',
          description: `Processed ${data?.sources_processed || 0} sources, found ${data?.total_items_found || 0} items`,
        });

        return data;
      } catch (error) {
        toast({
          title: 'Scheduled Scrape Failed',
          description: (error as Error).message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  return {
    fetchSources,
    fetchRuns,
    toggleSource,
    triggerScrape,
    triggerAllDue,
    loading,
  };
}
