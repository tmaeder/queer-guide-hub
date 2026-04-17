/**
 * TagSuggestionsQueue — Review pending tag suggestions from auto-tagging
 * and near-duplicate detection triggers.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import { Tag, CheckCircle, XCircle, AlertTriangle, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface TagSuggestionRow {
  id: string;
  entity_id: string;
  entity_type: string;
  tag_id: string | null;
  suggested_tag_name: string;
  confidence: number;
  source: string;
  status: string;
  ai_model: string | null;
  batch_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Bot }> = {
  auto_tag: { label: 'AI Auto-Tag', icon: Sparkles },
  duplicate_warning: { label: 'Near Duplicate', icon: AlertTriangle },
};

async function fetchPendingSuggestions(): Promise<{ items: TagSuggestionRow[]; total: number }> {
  const { data, count, error } = await supabase
    .from('tag_suggestions' as const)
    .select('*', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return { items: (data || []) as TagSuggestionRow[], total: count ?? 0 };
}

export function TagSuggestionsQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['tag-suggestions-pending'],
    queryFn: fetchPendingSuggestions,
    staleTime: 30_000,
  });

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
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('tag_suggestions' as const)
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
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
      // Fetch ALL pending suggestion IDs (not just the loaded batch)
      const { data } = await supabase
        .from('tag_suggestions' as const)
        .select('id')
        .eq('status', 'pending')
        .limit(5000);
      setSelectedIds(new Set((data || []).map((i: { id: string }) => i.id)));
    }
  };

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  if (isLoading) return <LinearProgress />;

  if (items.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Box
          sx={{
            mx: 'auto',
            width: 80,
            height: 80,
            bgcolor: 'success.main',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2,
            opacity: 0.9,
          }}
        >
          <Tag style={{ width: 40, height: 40, color: '#fff' }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          No pending suggestions
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mx: 'auto' }}>
          Tag suggestions from auto-tagging and near-duplicate detection will appear here for
          review.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Bulk actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <input
            type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size >= total}
            onChange={toggleSelectAll}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <Typography variant="body2" color="text.secondary">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected (all)`
              : `${total} pending suggestion${total !== 1 ? 's' : ''}`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                {selectedIds.size} selected
              </Typography>
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
        </Box>
      </Box>

      {/* Items */}
      {items.map((item) => {
        const sourceInfo = SOURCE_LABELS[item.source] || { label: item.source, icon: Tag };
        const SourceIcon = sourceInfo.icon;
        const confidenceColor =
          item.confidence >= 0.8 ? '#16a34a' : item.confidence >= 0.5 ? '#ca8a04' : '#dc2626';

        return (
          <Card key={item.id}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 0.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.suggested_tag_name}
                    </Typography>
                    <Badge variant="outline">{item.entity_type}</Badge>
                    <Chip
                      icon={<SourceIcon style={{ width: 12, height: 12 }} />}
                      label={sourceInfo.label}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 0.75,
                        py: 0.15,
                        borderRadius: 0.5,
                        bgcolor: `${confidenceColor}15`,
                        color: confidenceColor,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      {(item.confidence * 100).toFixed(0)}%
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Entity: {item.entity_id.slice(0, 8)}... |{' '}
                    {new Date(item.created_at).toLocaleDateString()}
                    {item.ai_model && ` | Model: ${item.ai_model}`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
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
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

export default TagSuggestionsQueue;
