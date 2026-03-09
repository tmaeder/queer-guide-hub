/**
 * useAutoTag — Hook for AI-powered auto-tagging of content items.
 *
 * Calls the `auto-tag-content` edge function to suggest tags using GPT-4o-mini,
 * then allows applying (approving) suggestions via the `tag_suggestions` table
 * and `unified_tag_assignments`.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────

export interface TagSuggestion {
  name: string;
  confidence: number;
  is_new: boolean;
  category?: string;
  tag_id?: string;
}

export interface AutoTagResult {
  entity_id: string;
  entity_type: string;
  entity_name: string;
  tags: TagSuggestion[];
  auto_approved: number;
  pending_review: number;
}

export interface AutoTagResponse {
  success: boolean;
  batch_id: string;
  dry_run: boolean;
  items_processed: number;
  suggestions: AutoTagResult[];
  new_tags_created: number;
  total_suggestions: number;
  total_auto_approved: number;
  error?: string;
  message?: string;
}

export interface BatchProgress {
  total: number;
  processed: number;
  status: 'idle' | 'running' | 'complete' | 'error';
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAutoTag() {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AutoTagResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    processed: 0,
    status: 'idle',
  });
  const { toast } = useToast();

  /**
   * Suggest tags for a single item (dry run — no DB writes).
   * Used by the AutoTagPanel in the CMS editor sidebar.
   */
  const suggestTags = useCallback(async (
    contentType: string,
    contentId: string,
  ): Promise<AutoTagResult | null> => {
    setLoading(true);
    setSuggestions(null);

    try {
      const { data, error } = await api.functions.invoke('auto-tag-content', {
        body: {
          content_type: contentType,
          content_id: contentId,
          dry_run: true,
        },
      });

      if (error) throw new Error(error.message || 'Failed to get suggestions');

      const response = data as AutoTagResponse;
      if (!response.success) throw new Error(response.error || 'Unknown error');

      const result = response.suggestions?.[0] || null;
      setSuggestions(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to suggest tags';
      toast({ title: 'Auto-tag error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Apply tags to a single item (non-dry-run — creates suggestions + auto-approves).
   * Called after user reviews and confirms suggestions.
   */
  const applyTags = useCallback(async (
    contentType: string,
    contentId: string,
    autoApproveThreshold: number = 0,
  ): Promise<AutoTagResponse | null> => {
    setLoading(true);

    try {
      const { data, error } = await api.functions.invoke('auto-tag-content', {
        body: {
          content_type: contentType,
          content_id: contentId,
          dry_run: false,
          auto_approve_threshold: autoApproveThreshold,
        },
      });

      if (error) throw new Error(error.message || 'Failed to apply tags');

      const response = data as AutoTagResponse;
      if (!response.success) throw new Error(response.error || 'Unknown error');

      const result = response.suggestions?.[0];
      const total = result?.tags?.length || 0;
      const approved = result?.auto_approved || 0;

      toast({
        title: 'Tags applied',
        description: `${approved} tag${approved !== 1 ? 's' : ''} assigned (${total} suggested)`,
      });

      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to apply tags';
      toast({ title: 'Auto-tag error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Approve or reject a specific tag suggestion by ID.
   */
  const reviewSuggestion = useCallback(async (
    suggestionId: string,
    approve: boolean,
  ): Promise<boolean> => {
    try {
      if (approve) {
        // Use the DB function to atomically approve + insert assignment
        const { error } = await api.rpc('approve_tag_suggestions', {
          p_suggestion_ids: [suggestionId],
        });
        if (error) throw error;
      } else {
        // Just reject
        const { error } = await api
          .from('tag_suggestions' as any)
          .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
          .eq('id', suggestionId);
        if (error) throw error;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to review suggestion';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return false;
    }
  }, [toast]);

  /**
   * Batch auto-tag all untagged items of a content type.
   * Used by the BatchAutoTagDialog in AdminTags.
   */
  const batchAutoTag = useCallback(async (
    contentType: string,
    limit: number = 50,
    autoApproveThreshold: number = 0.85,
  ): Promise<AutoTagResponse | null> => {
    setLoading(true);
    setBatchProgress({ total: 0, processed: 0, status: 'running' });

    try {
      const { data, error } = await api.functions.invoke('auto-tag-content', {
        body: {
          content_type: contentType,
          batch: true,
          batch_limit: limit,
          dry_run: false,
          auto_approve_threshold: autoApproveThreshold,
        },
      });

      if (error) throw new Error(error.message || 'Batch auto-tag failed');

      const response = data as AutoTagResponse;
      if (!response.success) throw new Error(response.error || 'Unknown error');

      setBatchProgress({
        total: response.items_processed,
        processed: response.items_processed,
        status: 'complete',
      });

      toast({
        title: 'Batch auto-tag complete',
        description: `${response.items_processed} items processed, ${response.total_suggestions} tags suggested, ${response.total_auto_approved} auto-approved`,
      });

      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch auto-tag failed';
      setBatchProgress(prev => ({ ...prev, status: 'error' }));
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Fetch pending tag suggestions for a given entity type.
   */
  const getPendingSuggestions = useCallback(async (
    entityType?: string,
    limit: number = 100,
  ) => {
    try {
      let query = api
        .from('tag_suggestions' as any)
        .select('*')
        .eq('status', 'pending')
        .order('confidence', { ascending: false })
        .limit(limit);

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch pending suggestions:', err);
      return [];
    }
  }, []);

  return {
    loading,
    suggestions,
    batchProgress,
    suggestTags,
    applyTags,
    reviewSuggestion,
    batchAutoTag,
    getPendingSuggestions,
    clearSuggestions: () => setSuggestions(null),
  };
}
