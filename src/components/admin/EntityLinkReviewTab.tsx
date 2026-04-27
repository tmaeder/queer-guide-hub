/**
 * Entity Link Review Tab — surfaces pending rows from entity_link_review
 * (populated by news_commit_staging_batch from quality-enhance review queue).
 * Admins approve / reject candidate entity links per article.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { CheckCircle2, XCircle } from 'lucide-react';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = untypedSupabase as any;

type EntityType = 'country' | 'city' | 'region' | 'venue' | 'event' | 'personality' | 'organisation';

interface ReviewRow {
  id: string;
  article_id: string;
  entity_type: EntityType;
  candidate_id: string | null;
  candidate_name: string;
  score: number | null;
  context_snippet: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  // Joined article context
  news_articles?: { id: string; title: string; url: string | null } | null;
}

export default function EntityLinkReviewTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<EntityType | 'all'>('all');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['entity-link-review', filter],
    queryFn: async () => {
      let query = sb
        .from('entity_link_review')
        .select('*, news_articles(id, title, url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter !== 'all') query = query.eq('entity_type', filter);
      const { data, error: e } = await query;
      if (e) throw e;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error: e } = await sb
        .from('entity_link_review')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (e) throw e;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'approved' ? 'Approved' : 'Rejected');
      qc.invalidateQueries({ queryKey: ['entity-link-review'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;

  const types: Array<EntityType | 'all'> = [
    'all', 'country', 'city', 'region', 'venue', 'event', 'personality', 'organisation',
  ];

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap' }}>
        {types.map((t) => (
          <Chip
            key={t}
            label={t}
            color={filter === t ? 'primary' : 'default'}
            variant={filter === t ? 'filled' : 'outlined'}
            onClick={() => setFilter(t)}
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Stack>

      {(!rows || rows.length === 0) && (
        <Alert severity="info">No pending entity-link review items.</Alert>
      )}

      <Stack spacing={2}>
        {rows?.map((r) => (
          <Box key={r.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={r.entity_type} color="primary" variant="outlined" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {r.candidate_name}
                  </Typography>
                  {r.score != null && (
                    <Chip
                      size="small"
                      label={`score ${(r.score * 100).toFixed(0)}%`}
                      variant="outlined"
                    />
                  )}
                </Stack>
                {r.context_snippet && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {r.context_snippet}
                  </Typography>
                )}
                {r.news_articles && (
                  <Typography variant="caption" color="text.secondary">
                    Article: {r.news_articles.title}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircle2 size={14} />}
                  onClick={() => resolve.mutate({ id: r.id, status: 'approved' })}
                  disabled={resolve.isPending}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<XCircle size={14} />}
                  onClick={() => resolve.mutate({ id: r.id, status: 'rejected' })}
                  disabled={resolve.isPending}
                >
                  Reject
                </Button>
              </Stack>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
