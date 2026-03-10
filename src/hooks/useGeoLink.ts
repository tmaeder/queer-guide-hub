/**
 * useGeoLink — Hook for deterministic geo-linking of content items.
 *
 * Calls the `geo-link-content` edge function to match content items
 * (venues, events, personalities, news_articles) to cities and countries
 * using alias normalization and exact matching.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────

export interface GeoLinkResult {
  entity_id: string;
  entity_name: string;
  city_resolved: string | null;
  country_resolved: string | null;
  city_id: string | null;
  country_id: string | null;
  status: 'linked' | 'partial' | 'skipped' | 'already_linked' | 'no_data';
}

export interface GeoLinkResponse {
  success: boolean;
  content_type?: string;
  dry_run: boolean;
  total_processed: number;
  total_linked: number;
  total_partial: number;
  total_skipped: number;
  total_already_linked: number;
  results: GeoLinkResult[];
  error?: string;
}

export interface GeoLinkBatchAllResponse {
  success: boolean;
  batch_all: boolean;
  dry_run: boolean;
  results: Record<string, GeoLinkResponse>;
  error?: string;
}

export interface UnlinkedCounts {
  venues: number;
  events: number;
  personalities: number;
  news_articles: number;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useGeoLink() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeoLinkResponse | null>(null);
  const [batchAllResult, setBatchAllResult] = useState<GeoLinkBatchAllResponse | null>(null);
  const [unlinkedCounts, setUnlinkedCounts] = useState<UnlinkedCounts | null>(null);
  const { toast } = useToast();

  /**
   * Link a single content item to city/country.
   */
  const linkSingle = useCallback(async (
    contentType: string,
    contentId: string,
  ): Promise<GeoLinkResponse | null> => {
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await api.functions.invoke('geo-link-content', {
        body: {
          content_type: contentType,
          content_id: contentId,
        },
      });

      if (error) throw new Error(error.message || 'Failed to geo-link');

      const response = data as GeoLinkResponse;
      if (!response.success) throw new Error(response.error || 'Unknown error');

      setResult(response);

      const item = response.results?.[0];
      if (item?.status === 'linked') {
        toast({
          title: 'Location linked',
          description: `${item.city_resolved || ''}${item.city_resolved && item.country_resolved ? ', ' : ''}${item.country_resolved || ''}`,
        });
      } else if (item?.status === 'partial') {
        toast({
          title: 'Partially linked',
          description: `${item.city_resolved || item.country_resolved || 'Some location data resolved'}`,
        });
      } else if (item?.status === 'already_linked') {
        toast({ title: 'Already linked', description: 'This item already has geo-links' });
      } else {
        toast({
          title: 'Could not link',
          description: 'No matching city or country found',
          variant: 'destructive',
        });
      }

      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to geo-link';
      toast({ title: 'Geo-link error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Batch link all unlinked items of a content type.
   */
  const batchLink = useCallback(async (
    contentType: string,
    limit: number = 200,
    dryRun: boolean = false,
  ): Promise<GeoLinkResponse | null> => {
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await api.functions.invoke('geo-link-content', {
        body: {
          content_type: contentType,
          batch: true,
          batch_limit: limit,
          dry_run: dryRun,
        },
      });

      if (error) throw new Error(error.message || 'Batch geo-link failed');

      const response = data as GeoLinkResponse;
      if (!response.success) throw new Error(response.error || 'Unknown error');

      setResult(response);

      toast({
        title: dryRun ? 'Dry run complete' : 'Batch geo-link complete',
        description: `${response.total_processed} processed, ${response.total_linked} linked, ${response.total_partial} partial, ${response.total_skipped} skipped`,
      });

      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch geo-link failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Batch link all content types at once.
   */
  const batchLinkAll = useCallback(async (
    limit: number = 200,
    dryRun: boolean = false,
  ): Promise<GeoLinkBatchAllResponse | null> => {
    setLoading(true);
    setBatchAllResult(null);

    try {
      const { data, error } = await api.functions.invoke('geo-link-content', {
        body: {
          batch_all: true,
          batch_limit: limit,
          dry_run: dryRun,
        },
      });

      if (error) throw new Error(error.message || 'Batch all geo-link failed');

      const response = data as GeoLinkBatchAllResponse;
      if (!response.success) throw new Error((response as any).error || 'Unknown error');

      setBatchAllResult(response);

      // Sum up totals
      let totalLinked = 0;
      let totalProcessed = 0;
      for (const r of Object.values(response.results)) {
        totalLinked += r.total_linked + r.total_partial;
        totalProcessed += r.total_processed;
      }

      toast({
        title: dryRun ? 'Dry run complete' : 'All content types geo-linked',
        description: `${totalProcessed} items processed, ${totalLinked} linked`,
      });

      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch all geo-link failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Get counts of unlinked items per content type.
   */
  const getUnlinkedCounts = useCallback(async (): Promise<UnlinkedCounts> => {
    try {
      const [venuesRes, eventsRes, personalitiesRes, newsLinkedRes, newsTotalRes] =
        await Promise.all([
          api
            .from('venues')
            .select('id', { count: 'exact', head: true })
            .or('city_id.is.null,country_id.is.null'),
          api
            .from('events')
            .select('id', { count: 'exact', head: true })
            .or('city_id.is.null,country_id.is.null'),
          api
            .from('personalities')
            .select('id', { count: 'exact', head: true })
            .or('city_id.is.null,country_id.is.null')
            .or('nationality.neq.,birth_place.neq.'),
          api
            .from('news_article_countries')
            .select('article_id'),
          api
            .from('news_articles')
            .select('id', { count: 'exact', head: true }),
        ]);

      const linkedNewsIds = new Set(
        (newsLinkedRes.data || []).map((r: any) => r.article_id)
      );

      const counts: UnlinkedCounts = {
        venues: venuesRes.count || 0,
        events: eventsRes.count || 0,
        personalities: personalitiesRes.count || 0,
        news_articles: (newsTotalRes.count || 0) - linkedNewsIds.size,
      };

      setUnlinkedCounts(counts);
      return counts;
    } catch (err) {
      console.error('Failed to fetch unlinked counts:', err);
      const empty = { venues: 0, events: 0, personalities: 0, news_articles: 0 };
      setUnlinkedCounts(empty);
      return empty;
    }
  }, []);

  return {
    loading,
    result,
    batchAllResult,
    unlinkedCounts,
    linkSingle,
    batchLink,
    batchLinkAll,
    getUnlinkedCounts,
  };
}
