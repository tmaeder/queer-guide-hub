/**
 * ModerationQueue — community-submitted content awaiting moderation.
 * Pulls from `community_submissions` (status='pending' / feedback_status='new')
 * and surfaces approve / reject / spam actions. Reuses CommentThread for context.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { ThumbsUp, ThumbsDown, Flag, ShieldAlert, Inbox, MessageSquare } from 'lucide-react';
import { listFromWhere, updateRow } from '@/hooks/usePageFetchers';
import { CommentThread } from './CommentThread';

interface ModerationItem {
  id: string;
  content_type: string;
  status: string;
  feedback_status: string;
  is_spam: boolean;
  priority: number;
  data: Record<string, unknown> | null;
  submitted_at: string;
  submitted_by: string | null;
  ip_address: string | null;
}

type FilterKind = 'pending' | 'spam' | 'all';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function previewTitle(item: ModerationItem): string {
  const data = item.data ?? {};
  const candidate =
    (data.title as string) ||
    (data.name as string) ||
    (data.subject as string) ||
    (data.content as string) ||
    (data.message as string) ||
    '(Untitled submission)';
  return String(candidate).slice(0, 120);
}

export function ModerationQueue() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>('pending');
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'in' }> = [];
    if (filter === 'pending') {
      filters.push({ col: 'feedback_status', val: ['new', 'under_review'], op: 'in' });
      filters.push({ col: 'is_spam', val: false });
    } else if (filter === 'spam') {
      filters.push({ col: 'is_spam', val: true });
    }
    try {
      const data = await listFromWhere<ModerationItem>(
        'community_submissions',
        'id, content_type, status, feedback_status, is_spam, priority, data, submitted_at, submitted_by, ip_address',
        filters,
        { order: { col: 'submitted_at', ascending: false }, limit: 100 },
      );
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    return {
      pending: items.filter((i) => !i.is_spam && ['new', 'under_review'].includes(i.feedback_status))
        .length,
      spam: items.filter((i) => i.is_spam).length,
      total: items.length,
    };
  }, [items]);

  const transition = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ModerationItem, 'feedback_status' | 'is_spam' | 'status'>>,
    ) => {
      setActionId(id);
      const { error: err } = await updateRow('community_submissions', id, {
        ...patch,
        reviewed_at: new Date().toISOString(),
      });
      setActionId(null);
      if (err) {
        setError((err as { message: string }).message);
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    },
    [],
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Moderation Queue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {counts.pending} pending · {counts.spam} flagged as spam
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="moderation-filter-label">Filter</InputLabel>
          <Select
            labelId="moderation-filter-label"
            value={filter}
            label="Filter"
            onChange={(e) => setFilter(e.target.value as FilterKind)}
          >
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="spam">Spam</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} aria-label="Loading" />
        </Box>
      ) : items.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 8,
            color: 'text.secondary',
          }}
        >
          <Inbox size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2">Nothing to moderate.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((item) => {
            const busy = actionId === item.id;
            const expanded = expandedId === item.id;
            return (
              <Box
                key={item.id}
                sx={{
                  border: '1px solid',
                  borderColor: item.is_spam ? 'error.light' : 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Chip
                      label={item.content_type}
                      size="small"
                      sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                    />
                    {item.is_spam && (
                      <Chip
                        icon={<Flag size={12} />}
                        label="Spam"
                        size="small"
                        color="error"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    )}
                    {item.priority > 0 && (
                      <Chip
                        icon={<ShieldAlert size={12} />}
                        label={`Priority ${item.priority}`}
                        size="small"
                        color="warning"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {relativeTime(item.submitted_at)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {previewTitle(item)}
                  </Typography>
                  {item.submitted_by && (
                    <Typography variant="caption" color="text.secondary">
                      by {item.submitted_by.slice(0, 8)}…
                    </Typography>
                  )}
                </Box>

                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled={busy}
                    onClick={() => transition(item.id, { feedback_status: 'approved', status: 'approved' })}
                    startIcon={<ThumbsUp size={14} />}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={busy}
                    onClick={() => transition(item.id, { feedback_status: 'rejected', status: 'rejected' })}
                    startIcon={<ThumbsDown size={14} />}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                  >
                    Reject
                  </Button>
                  {!item.is_spam && (
                    <Button
                      size="small"
                      variant="text"
                      color="warning"
                      disabled={busy}
                      onClick={() => transition(item.id, { is_spam: true })}
                      startIcon={<Flag size={14} />}
                      sx={{ textTransform: 'none', fontWeight: 500, fontSize: '0.8rem' }}
                    >
                      Mark spam
                    </Button>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    startIcon={<MessageSquare size={14} />}
                    sx={{ textTransform: 'none', fontWeight: 500, fontSize: '0.8rem', color: 'text.secondary' }}
                  >
                    {expanded ? 'Hide' : 'Discuss'}
                  </Button>
                </Box>

                {expanded && (
                  <Box
                    sx={{
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      p: 2,
                      bgcolor: 'grey.50',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Submission data
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.5,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: 200,
                      }}
                    >
                      {JSON.stringify(item.data, null, 2)}
                    </Box>
                    <Box sx={{ mt: 2 }}>
                      <CommentThread sourceTable="community_submissions" sourceId={item.id} />
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
