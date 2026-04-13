import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { FeedbackCard } from '@/components/feedback/FeedbackCard';
import type { FeedbackItem } from '@/components/feedback/FeedbackCard';
import { useFeedbackVoteCounts } from '@/hooks/useFeedbackVote';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bug, Lightbulb, Sparkles, BookOpen, ChevronUp, Clock } from 'lucide-react';

const columns = [
  { id: 'new', label: 'New', color: '#f59e0b' },
  { id: 'under_review', label: 'Under Review', color: '#3b82f6' },
  { id: 'planned', label: 'Planned', color: '#8b5cf6' },
  { id: 'in_progress', label: 'In Progress', color: '#f97316' },
  { id: 'done', label: 'Done', color: '#22c55e' },
] as const;

const categoryConfig: Record<string, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: '#ef4444' },
  idea: { label: 'Idea', icon: Lightbulb, color: '#f59e0b' },
  improvement: { label: 'Improvement', icon: Sparkles, color: '#8b5cf6' },
  'content-idea': { label: 'Content', icon: BookOpen, color: '#0ea5e9' },
};

export default function FeedbackBoard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Fetch all feedback submissions
  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback-board'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_submissions' as const)
        .select('id,data,submitted_at,feedback_status')
        .eq('content_type', 'feedback')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Batch vote counts
  const submissionIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: votesMap = {} } = useFeedbackVoteCounts(submissionIds);

  // Group items by column, sort by votes (desc)
  const grouped = useMemo(() => {
    const map: Record<string, FeedbackItem[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const item of items) {
      const status = item.feedback_status || 'new';
      if (map[status]) map[status].push(item);
      else map.new.push(item);
    }
    // Sort each column by vote count desc
    for (const col of columns) {
      map[col.id].sort((a, b) => (votesMap[b.id]?.count ?? 0) - (votesMap[a.id]?.count ?? 0));
    }
    return map;
  }, [items, votesMap]);

  // Vote mutation (for detail dialog)
  const voteMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      if (!user) throw new Error('Login required');
      const voteState = votesMap[submissionId];
      if (voteState?.hasVoted) {
        await supabase
          .from('feedback_votes' as const)
          .delete()
          .eq('submission_id', submissionId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('feedback_votes' as const)
          .insert({ submission_id: submissionId, user_id: user.id });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-votes'] });
    },
  });

  const handleVote = useCallback(
    (id: string) => {
      if (!user) {
        toast({ title: 'Log in to vote', description: 'Create a free account to upvote feedback.' });
        return;
      }
      voteMutation.mutate(id);
    },
    [user, voteMutation, toast],
  );

  const handleCardClick = useCallback((item: FeedbackItem) => {
    setSelectedItem(item);
    setDetailOpen(true);
  }, []);

  if (isLoading) {
    return (
      <Container sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container sx={{ py: { xs: 2, sm: 4 } }}>
      <PageHeader
        title="Community Feedback"
        subtitle="Ideas, bugs, and improvements from the community. Vote on what matters most."
      />

      {/* Kanban board */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `repeat(${columns.length}, 1fr)` },
          gap: 2,
          mt: 3,
        }}
      >
        {columns.map((col) => {
          const colItems = grouped[col.id] || [];
          return (
            <Box key={col.id}>
              {/* Column header */}
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

              {/* Cards */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  maxHeight: { md: 'calc(100vh - 280px)' },
                  overflowY: 'auto',
                  pr: 0.5,
                }}
              >
                {colItems.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No items yet
                  </Typography>
                )}
                {colItems.map((item) => (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    voteCount={votesMap[item.id]?.count ?? 0}
                    hasVoted={votesMap[item.id]?.hasVoted ?? false}
                    onVote={() => handleVote(item.id)}
                    onClick={() => handleCardClick(item)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedItem.data.title}</DialogTitle>
              </DialogHeader>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {(() => {
                  const cat = categoryConfig[selectedItem.data.category];
                  if (!cat) return null;
                  const Icon = cat.icon;
                  return (
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
                      <Icon style={{ width: 12, height: 12 }} />
                      {cat.label}
                    </Badge>
                  );
                })()}
                {(() => {
                  const col = columns.find((c) => c.id === selectedItem.feedback_status);
                  return col ? (
                    <Badge variant="secondary" style={{ backgroundColor: col.color, color: '#fff' }}>
                      {col.label}
                    </Badge>
                  ) : null;
                })()}
              </Box>

              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                {selectedItem.data.description}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant={votesMap[selectedItem.id]?.hasVoted ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleVote(selectedItem.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    ...(votesMap[selectedItem.id]?.hasVoted
                      ? { backgroundColor: '#DB2777', color: '#fff' }
                      : {}),
                  }}
                >
                  <ChevronUp style={{ width: 14, height: 14 }} />
                  {votesMap[selectedItem.id]?.count ?? 0} vote
                  {(votesMap[selectedItem.id]?.count ?? 0) !== 1 ? 's' : ''}
                </Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Clock style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(selectedItem.submitted_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
