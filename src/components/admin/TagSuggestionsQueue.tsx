/**
 * TagSuggestionsQueue — Review pending tag suggestions from auto-tagging
 * and near-duplicate detection triggers.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, CheckCircle, XCircle, AlertTriangle, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  usePendingTagSuggestions,
  fetchAllPendingTagSuggestionIds,
  rejectTagSuggestions,
} from '@/hooks/useTagSuggestionsQueue';

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Bot }> = {
  auto_tag: { label: 'AI Auto-Tag', icon: Sparkles },
  duplicate_warning: { label: 'Near Duplicate', icon: AlertTriangle },
};

export function TagSuggestionsQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = usePendingTagSuggestions();

  const items = data?.items || [];
  const total = data?.total || 0;

  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: count, error } = await supabase.rpc('approve_tag_suggestions', {
        p_suggestion_ids: ids,
        p_reviewer_id: user?.id,
      });
      if (error) throw error;
      return count;
    },
    onSuccess: (count) => {
      toast.success(`${count} suggestion${count !== 1 ? 's' : ''} approved`);
      queryClient.invalidateQueries({ queryKey: ['tag-suggestions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['review-counts'] });
      setSelectedIds(new Set());
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: (ids: string[]) => rejectTagSuggestions(ids, user?.id),
    onSuccess: (count) => {
      toast.success(`${count} suggestion${count !== 1 ? 's' : ''} rejected`);
      queryClient.invalidateQueries({ queryKey: ['tag-suggestions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['review-counts'] });
      setSelectedIds(new Set());
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to reject'),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = async () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      const ids = await fetchAllPendingTagSuggestionIds();
      setSelectedIds(new Set(ids));
    }
  };

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  if (isLoading) {
    return (
      <div className="w-full h-1 bg-muted rounded overflow-hidden">
        <div className="h-full bg-primary animate-pulse" style={{ width: '40%' }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mb-4 opacity-90">
          <Tag style={{ width: 40, height: 40, color: '#fff' }} />
        </div>
        <h3 className="text-lg font-semibold mb-1">No pending suggestions</h3>
        <p className="text-sm text-muted-foreground max-w-[320px] mx-auto">
          Tag suggestions from auto-tagging and near-duplicate detection will appear here for review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size >= total}
            onChange={toggleSelectAll}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <p className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected (all)`
              : `${total} pending suggestion${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {selectedIds.size > 0 && (
            <>
              <p className="text-sm text-muted-foreground">{selectedIds.size} selected</p>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => approveMutation.mutate(Array.from(selectedIds))}
                style={{ backgroundColor: '#16a34a', color: 'white', display: 'flex', gap: 6 }}
              >
                <CheckCircle style={{ height: 14, width: 14 }} /> Approve Selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() => rejectMutation.mutate(Array.from(selectedIds))}
                style={{ display: 'flex', gap: 6 }}
              >
                <XCircle style={{ height: 14, width: 14 }} /> Reject Selected
              </Button>
            </>
          )}
          <Button
            size="sm"
            disabled={isPending || items.length === 0}
            onClick={() => approveMutation.mutate(items.map((i) => i.id))}
            style={{ backgroundColor: '#16a34a', color: 'white', display: 'flex', gap: 6 }}
          >
            <CheckCircle style={{ height: 14, width: 14 }} /> Approve All ({items.length})
          </Button>
        </div>
      </div>

      {/* Items */}
      {items.map((item) => {
        const sourceInfo = SOURCE_LABELS[item.source] || { label: item.source, icon: Tag };
        const SourceIcon = sourceInfo.icon;
        const confidenceColor =
          item.confidence >= 0.8 ? '#16a34a' : item.confidence >= 0.5 ? '#ca8a04' : '#dc2626';

        return (
          <Card key={item.id}>
            <CardContent>
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-[0.9rem]">{item.suggested_tag_name}</p>
                    <Badge variant="outline">{item.entity_type}</Badge>
                    <Badge variant="outline" className="text-[0.7rem] gap-1">
                      <SourceIcon style={{ width: 12, height: 12 }} />
                      {sourceInfo.label}
                    </Badge>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.7rem] font-semibold"
                      style={{ backgroundColor: `${confidenceColor}15`, color: confidenceColor }}
                    >
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Entity: {item.entity_id?.slice(0, 8) ?? '—'}... |{' '}
                    {new Date(item.created_at).toLocaleDateString()}
                    {item.ai_model && ` | Model: ${item.ai_model}`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => approveMutation.mutate([item.id])}
                    style={{ backgroundColor: '#16a34a', color: 'white', padding: '4px 8px' }}
                  >
                    <CheckCircle style={{ height: 14, width: 14 }} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => rejectMutation.mutate([item.id])}
                    style={{ padding: '4px 8px' }}
                  >
                    <XCircle style={{ height: 14, width: 14 }} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default TagSuggestionsQueue;
