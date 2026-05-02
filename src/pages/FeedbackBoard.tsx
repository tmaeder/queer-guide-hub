import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { fetchFeedbackBoardItems, toggleFeedbackVote } from '@/hooks/usePageFetchers';
import { Bug, Lightbulb, Sparkles, BookOpen, ChevronUp, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { _t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback-board'],
    queryFn: () => fetchFeedbackBoardItems<FeedbackItem>(),
  });

  const submissionIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: votesMap = {} } = useFeedbackVoteCounts(submissionIds);

  const grouped = useMemo(() => {
    const map: Record<string, FeedbackItem[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const item of items) {
      const status = item.feedback_status || 'new';
      if (map[status]) map[status].push(item);
      else map.new.push(item);
    }
    for (const col of columns) {
      map[col.id].sort((a, b) => (votesMap[b.id]?.count ?? 0) - (votesMap[a.id]?.count ?? 0));
    }
    return map;
  }, [items, votesMap]);

  const voteMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      if (!user) throw new Error('Login required');
      const voteState = votesMap[submissionId];
      await toggleFeedbackVote(submissionId, user.id, !!voteState?.hasVoted);
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
      <div className="container mx-auto py-12 px-4 text-center">
        <Loader2 className="h-6 w-6 animate-spin inline-block" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 sm:py-8 px-4">
      <PageHeader
        title="Community Feedback"
        subtitle="Ideas, bugs, and improvements from the community. Vote on what matters most."
      />

      <div
        className="grid gap-4 mt-6"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 220px), 1fr))` }}
      >
        {columns.map((col) => {
          const colItems = grouped[col.id] || [];
          return (
            <div key={col.id}>
              <div
                className="flex items-center gap-2 mb-3 pb-2 border-b-2"
                style={{ borderColor: col.color }}
              >
                <p className="text-sm font-bold">{col.label}</p>
                <Badge variant="secondary" className="text-[0.65rem]">
                  {colItems.length}
                </Badge>
              </div>

              <div className="flex flex-col gap-2 md:max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {colItems.length === 0 && (
                  <span className="text-xs text-muted-foreground py-5 text-center italic opacity-60">
                    —
                  </span>
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
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedItem.data.title}</DialogTitle>
              </DialogHeader>

              <div className="flex gap-2 flex-wrap mb-4">
                {(() => {
                  const cat = categoryConfig[selectedItem.data.category];
                  if (!cat) return null;
                  const Icon = cat.icon;
                  return (
                    <Badge
                      variant="outline"
                      style={{ borderColor: cat.color, color: cat.color }}
                      className="inline-flex items-center gap-1"
                    >
                      <Icon className="w-3 h-3" />
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
              </div>

              <p className="text-sm whitespace-pre-wrap mb-4">{selectedItem.data.description}</p>

              <div className="flex items-center gap-4">
                <Button
                  variant={votesMap[selectedItem.id]?.hasVoted ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleVote(selectedItem.id)}
                  style={{
                    ...(votesMap[selectedItem.id]?.hasVoted
                      ? { backgroundColor: 'hsl(var(--accent-warm))', color: '#fff' }
                      : {}),
                  }}
                >
                  <ChevronUp className="w-3.5 h-3.5 mr-1.5" />
                  {votesMap[selectedItem.id]?.count ?? 0} vote
                  {(votesMap[selectedItem.id]?.count ?? 0) !== 1 ? 's' : ''}
                </Button>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {new Date(selectedItem.submitted_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
