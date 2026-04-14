import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Collapse from '@mui/material/Collapse';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useFeedbackVoteCounts } from '@/hooks/useFeedbackVote';
import {
  ChevronUp,
  Clock,
  X,
  Github,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Monitor,
  AlertTriangle,
  Wifi,
  Camera,
  MessageSquarePlus,
  Copy,
} from 'lucide-react';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';

const kanbanColumns = [
  { id: 'new', label: 'New', color: '#f59e0b' },
  { id: 'under_review', label: 'Under Review', color: '#3b82f6' },
  { id: 'planned', label: 'Planned', color: '#8b5cf6' },
  { id: 'in_progress', label: 'In Progress', color: '#f97316' },
  { id: 'done', label: 'Done', color: '#22c55e' },
] as const;

type KanbanStatus = (typeof kanbanColumns)[number]['id'];

interface FeedbackContext {
  url?: string;
  viewport?: { width: number; height: number };
  user_agent?: string;
  color_scheme?: string;
  timestamp?: string;
  errors?: Array<{ message: string; stack?: string; ts: string }>;
  network_failures?: Array<{ method: string; url: string; status: number; ts: string }>;
}

interface FeedbackSubmission {
  id: string;
  data: {
    title: string;
    description: string;
    category: string;
    contact_email?: string | null;
    context?: FeedbackContext;
    screenshot_url?: string | null;
  };
  submitted_at: string;
  feedback_status: string;
  reviewer_notes?: string | null;
  github_issue_url?: string | null;
  github_issue_number?: number | null;
  forwarded_at?: string | null;
}

function formatClaudePrompt(item: FeedbackSubmission): string {
  const d = item.data;
  const ctx = d.context || {};
  const lines: string[] = [];

  lines.push('Fix this user-reported issue from queer.guide:');
  lines.push('');
  lines.push(`## ${d.title}`);
  lines.push(
    `Category: ${d.category} | Submission ID: ${item.id} | Reported: ${item.submitted_at}`,
  );
  lines.push('');
  lines.push('### Description');
  lines.push(d.description || '_(no description)_');
  lines.push('');

  const contextLines: string[] = [];
  if (ctx.url) contextLines.push(`- URL: ${ctx.url}`);
  if (ctx.viewport) contextLines.push(`- Viewport: ${ctx.viewport.width}×${ctx.viewport.height}`);
  if (ctx.color_scheme) contextLines.push(`- Color scheme: ${ctx.color_scheme}`);
  if (ctx.user_agent) contextLines.push(`- User agent: ${ctx.user_agent}`);
  if (d.contact_email) contextLines.push(`- Contact: ${d.contact_email}`);
  if (contextLines.length > 0) {
    lines.push('### Context');
    lines.push(...contextLines);
    lines.push('');
  }

  if (d.screenshot_url) {
    lines.push('### Screenshot');
    lines.push(d.screenshot_url);
    lines.push('');
  }

  if (ctx.errors && ctx.errors.length > 0) {
    lines.push(`### Console errors (${ctx.errors.length})`);
    lines.push('```');
    for (const err of ctx.errors) {
      lines.push(`[${err.ts}] ${err.message}`);
      if (err.stack) lines.push(err.stack.split('\n').slice(0, 5).join('\n'));
    }
    lines.push('```');
    lines.push('');
  }

  if (ctx.network_failures && ctx.network_failures.length > 0) {
    lines.push(`### Network failures (${ctx.network_failures.length})`);
    lines.push('```');
    for (const nf of ctx.network_failures) {
      lines.push(`[${nf.ts}] ${nf.method} ${nf.url} → ${nf.status}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('Repo: queer-guide-hub');
  lines.push(
    'Please investigate, find root cause, and propose a fix. Check relevant components based on the URL path and error messages.',
  );

  return lines.join('\n');
}

export default function AdminFeedback() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<FeedbackSubmission | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<FeedbackSubmission[]>({
    queryKey: ['admin-feedback-board'],
    queryFn: async () => {
      const { data, error } = await supabase
         
        .from('community_submissions' as const)
        .select(
          'id,data,submitted_at,feedback_status,reviewer_notes,github_issue_url,github_issue_number,forwarded_at',
        )
        .eq('content_type', 'feedback')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data || []) as FeedbackSubmission[];
    },
  });

  const submissionIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: votesMap = {} } = useFeedbackVoteCounts(submissionIds);

  const grouped = useMemo(() => {
    const map: Record<KanbanStatus, FeedbackSubmission[]> = {
      new: [],
      under_review: [],
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const item of items) {
      const status = (item.feedback_status || 'new') as KanbanStatus;
      if (map[status]) map[status].push(item);
      else map.new.push(item);
    }
    for (const col of kanbanColumns) {
      map[col.id].sort((a, b) => (votesMap[b.id]?.count ?? 0) - (votesMap[a.id]?.count ?? 0));
    }
    return map;
  }, [items, votesMap]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: KanbanStatus }) => {
      const { error } = await supabase
         
        .from('community_submissions' as const)
        .update({
          feedback_status: status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
         
        .from('community_submissions' as const)
        .update({ reviewer_notes: notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      toast({ title: 'Notes saved' });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('forward-feedback-to-github', {
        body: { submission_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, id) => {
      if (data?.already_forwarded) {
        toast({ title: 'Already forwarded', description: `Issue #${data.number}` });
      } else {
        toast({ title: 'Forwarded to GitHub', description: `Issue #${data.number} created` });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      // Update selected item so the UI reflects the new state immediately
      if (selected?.id === id) {
        setSelected({
          ...selected,
          github_issue_url: data.url,
          github_issue_number: data.number,
          forwarded_at: new Date().toISOString(),
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Forward failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleCardClick = useCallback((item: FeedbackSubmission) => {
    setSelected(item);
    setDrawerOpen(true);
  }, []);

  const handleStatusChange = useCallback(
    (status: KanbanStatus) => {
      if (!selected) return;
      statusMutation.mutate({ id: selected.id, status });
      setSelected({ ...selected, feedback_status: status });
    },
    [selected, statusMutation],
  );

  if (isLoading) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Feedback"
        subtitle={`${items.length} submissions — ideas, bugs, and improvements from the community`}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `repeat(${kanbanColumns.length}, 1fr)` },
          gap: 2,
          mt: 3,
        }}
      >
        {kanbanColumns.map((col) => {
          const colItems = grouped[col.id];
          return (
            <Box key={col.id}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.5,
                  pb: 1,
                  borderBottom: 2,
                  borderColor: col.color,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {col.label}
                </Typography>
                <Badge variant="secondary" style={{ fontSize: '0.65rem' }}>
                  {colItems.length}
                </Badge>
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  maxHeight: { md: 'calc(100vh - 260px)' },
                  overflowY: 'auto',
                  pr: 0.5,
                }}
              >
                {colItems.length === 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ py: 3, textAlign: 'center' }}
                  >
                    No items
                  </Typography>
                )}
                {colItems.map((item) => (
                  <AdminFeedbackCard
                    key={item.id}
                    item={item}
                    voteCount={votesMap[item.id]?.count ?? 0}
                    onClick={() => handleCardClick(item)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      <FeedbackDetailDrawer
        open={drawerOpen}
        item={selected}
        onClose={() => setDrawerOpen(false)}
        onStatusChange={handleStatusChange}
        onSaveNotes={(notes) => selected && notesMutation.mutate({ id: selected.id, notes })}
        onForward={() => selected && forwardMutation.mutate(selected.id)}
        isForwarding={forwardMutation.isPending}
        voteCount={selected ? (votesMap[selected.id]?.count ?? 0) : 0}
      />
    </Box>
  );
}

// ── Admin Feedback Card ─────────────────────────────────────────

interface AdminFeedbackCardProps {
  item: FeedbackSubmission;
  voteCount: number;
  onClick: () => void;
}

function AdminFeedbackCard({ item, voteCount, onClick }: AdminFeedbackCardProps) {
  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const Icon = cat.icon;
  const isForwarded = !!item.github_issue_url;

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        cursor: 'pointer',
        display: 'flex',
        gap: 1.5,
        transition: 'all 0.15s',
        '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.25,
          minWidth: 32,
          pt: 0.25,
        }}
      >
        <ChevronUp style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          {voteCount}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
          <Badge
            variant="outline"
            style={{
              borderColor: cat.color,
              color: cat.color,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.65rem',
              padding: '1px 6px',
            }}
          >
            <Icon style={{ width: 10, height: 10 }} />
            {cat.label}
          </Badge>
          {isForwarded && (
            <Badge
              variant="outline"
              style={{
                borderColor: '#6366f1',
                color: '#6366f1',
                fontSize: '0.6rem',
                padding: '1px 5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Github style={{ width: 9, height: 9 }} />#{item.github_issue_number}
            </Badge>
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            mb: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.data.title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}
        >
          {item.data.description}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
          <Clock style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            {timeAgo(item.submitted_at)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────

interface FeedbackDetailDrawerProps {
  open: boolean;
  item: FeedbackSubmission | null;
  voteCount: number;
  onClose: () => void;
  onStatusChange: (status: KanbanStatus) => void;
  onSaveNotes: (notes: string) => void;
  onForward: () => void;
  isForwarding: boolean;
}

function FeedbackDetailDrawer({
  open,
  item,
  voteCount,
  onClose,
  onStatusChange,
  onSaveNotes,
  onForward,
  isForwarding,
}: FeedbackDetailDrawerProps) {
  const { toast } = useToast();
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState('');

  const handleCopyPrompt = async () => {
    if (!item) return;
    const prompt = formatClaudePrompt(item);
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: 'Prompt kopiert', description: 'In Claude Code einfügen' });
    } catch {
      toast({
        title: 'Copy fehlgeschlagen',
        description: 'Clipboard nicht verfügbar',
        variant: 'destructive',
      });
    }
  };

  // Sync notes when item changes
  const _itemId = item?.id;
  useMemo(() => {
    if (item) setLocalNotes(item.reviewer_notes || '');
  }, [item]);

  if (!item) return null;

  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const CatIcon = cat.icon;
  const ctx = item.data.context || {};
  const isForwarded = !!item.github_issue_url;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 3 } }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
            <Badge
              variant="outline"
              style={{
                borderColor: cat.color,
                color: cat.color,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CatIcon style={{ width: 12, height: 12 }} />
              {cat.label}
            </Badge>
            {isForwarded && (
              <Badge
                variant="outline"
                style={{
                  borderColor: '#6366f1',
                  color: '#6366f1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Github style={{ width: 11, height: 11 }} />
                Forwarded
              </Badge>
            )}
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {item.data.title}
          </Typography>
        </Box>
        <Button variant="ghost" size="sm" onClick={onClose} style={{ padding: 6 }}>
          <X style={{ width: 16, height: 16 }} />
        </Button>
      </Box>

      {/* Description */}
      <Typography
        variant="body2"
        sx={{ whiteSpace: 'pre-wrap', mb: 3, color: 'text.secondary' }}
      >
        {item.data.description}
      </Typography>

      {/* Status selector */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>
          Status
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {kanbanColumns.map((col) => {
            const active = item.feedback_status === col.id;
            return (
              <Badge
                key={col.id}
                variant={active ? 'default' : 'outline'}
                style={{
                  cursor: 'pointer',
                  ...(active ? { backgroundColor: col.color, color: '#fff' } : {}),
                }}
                onClick={() => onStatusChange(col.id)}
              >
                {col.label}
              </Badge>
            );
          })}
        </Box>
      </Box>

      {/* Metadata grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1.5,
          mb: 3,
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
        }}
      >
        <MetaItem icon={ChevronUp} label="Votes" value={String(voteCount)} />
        <MetaItem icon={Clock} label="Submitted" value={timeAgo(item.submitted_at)} />
        {ctx.viewport && (
          <MetaItem
            icon={Monitor}
            label="Viewport"
            value={`${ctx.viewport.width}×${ctx.viewport.height}`}
          />
        )}
        {ctx.color_scheme && (
          <MetaItem icon={Monitor} label="Theme" value={ctx.color_scheme} />
        )}
      </Box>

      {/* Page URL */}
      {ctx.url && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Page URL
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              p: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.7rem',
            }}
          >
            <a
              href={ctx.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'inherit',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {ctx.url}
            </a>
            <ExternalLink style={{ width: 11, height: 11, flexShrink: 0 }} />
          </Box>
        </Box>
      )}

      {/* User agent */}
      {ctx.user_agent && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            User Agent
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              p: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              wordBreak: 'break-all',
            }}
          >
            {ctx.user_agent}
          </Typography>
        </Box>
      )}

      {/* Screenshot */}
      {item.data.screenshot_url && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
          >
            <Camera style={{ width: 12, height: 12 }} /> Screenshot
          </Typography>
          <Box
            onClick={() => setScreenshotOpen(true)}
            sx={{
              borderRadius: 1,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              cursor: 'pointer',
            }}
          >
            <img
              src={item.data.screenshot_url}
              alt="Page screenshot"
              style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
            />
          </Box>
          {screenshotOpen && (
            <Box
              onClick={() => setScreenshotOpen(false)}
              sx={{
                position: 'fixed',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.9)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
              }}
            >
              <img
                src={item.data.screenshot_url}
                alt="Page screenshot"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Errors collapsible */}
      {ctx.errors && ctx.errors.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              py: 0.5,
            }}
          >
            {errorsExpanded ? (
              <ChevronDown style={{ width: 14, height: 14 }} />
            ) : (
              <ChevronRight style={{ width: 14, height: 14 }} />
            )}
            <AlertTriangle style={{ width: 12, height: 12, color: '#ef4444' }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Console errors ({ctx.errors.length})
            </Typography>
          </Box>
          <Collapse in={errorsExpanded}>
            <Box
              sx={{
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {ctx.errors.map((err, i) => (
                <Box key={i} sx={{ mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ display: 'block', color: '#ef4444' }}>
                    {err.message}
                  </Typography>
                  {err.stack && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: 'text.secondary',
                        fontSize: '0.6rem',
                        mt: 0.25,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {err.stack.split('\n').slice(0, 3).join('\n')}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Network failures collapsible */}
      {ctx.network_failures && ctx.network_failures.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setNetworkExpanded(!networkExpanded)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              py: 0.5,
            }}
          >
            {networkExpanded ? (
              <ChevronDown style={{ width: 14, height: 14 }} />
            ) : (
              <ChevronRight style={{ width: 14, height: 14 }} />
            )}
            <Wifi style={{ width: 12, height: 12, color: '#f59e0b' }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Network failures ({ctx.network_failures.length})
            </Typography>
          </Box>
          <Collapse in={networkExpanded}>
            <Box
              sx={{
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {ctx.network_failures.map((nf, i) => (
                <Box key={i} sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{nf.status}</span>{' '}
                    {nf.method} {nf.url}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Reviewer notes */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
          Reviewer Notes
        </Typography>
        <Textarea
          value={localNotes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalNotes(e.target.value)}
          onBlur={() => {
            if (localNotes !== (item.reviewer_notes || '')) onSaveNotes(localNotes);
          }}
          placeholder="Internal notes (saved on blur)"
          style={{ minHeight: 80 }}
        />
      </Box>

      {/* Contact email */}
      {item.data.contact_email && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
            Contact
          </Typography>
          <Typography variant="body2">
            <a href={`mailto:${item.data.contact_email}`}>{item.data.contact_email}</a>
          </Typography>
        </Box>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button
          variant="outline"
          onClick={handleCopyPrompt}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Copy style={{ width: 14, height: 14 }} />
          Copy Prompt
        </Button>
        {isForwarded ? (
          <Button
            variant="outline"
            onClick={() => window.open(item.github_issue_url!, '_blank', 'noopener,noreferrer')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
          >
            <Github style={{ width: 14, height: 14 }} />
            View issue #{item.github_issue_number}
          </Button>
        ) : (
          <Button
            onClick={onForward}
            disabled={isForwarding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              backgroundColor: '#DB2777',
              color: '#fff',
            }}
          >
            <MessageSquarePlus style={{ width: 14, height: 14 }} />
            {isForwarding ? 'Forwarding...' : 'Fix with Claude'}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bug;
  label: string;
  value: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Icon style={{ width: 13, height: 13, color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontSize: '0.6rem', lineHeight: 1 }}
        >
          {label}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
