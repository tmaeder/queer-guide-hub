import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { FeedbackCard } from '@/components/feedback/FeedbackCard';
import type { FeedbackItem } from '@/components/feedback/FeedbackCard';
import { useFeedbackVoteCounts } from '@/hooks/useFeedbackVote';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { fetchFeedbackBoardItems, toggleFeedbackVote } from '@/hooks/usePageFetchers';
import { Bug, Lightbulb, Sparkles, BookOpen, ChevronUp, Clock } from '@/components/icons';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { cn } from '@/lib/utils';

const columns = [
  { id: 'new', label: 'New', color: 'hsl(var(--foreground))' },
  { id: 'under_review', label: 'Under Review', color: 'hsl(var(--muted-foreground))' },
  { id: 'planned', label: 'Planned', color: 'hsl(var(--muted-foreground))' },
  { id: 'in_progress', label: 'In Progress', color: 'hsl(var(--foreground))' },
  { id: 'done', label: 'Done', color: 'hsl(var(--foreground))' },
] as const;

const categoryConfig: Record<string, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'hsl(var(--foreground))' },
  idea: { label: 'Idea', icon: Lightbulb, color: 'hsl(var(--foreground))' },
  improvement: { label: 'Improvement', icon: Sparkles, color: 'hsl(var(--foreground))' },
  'content-idea': { label: 'Content', icon: BookOpen, color: 'hsl(var(--foreground))' },
};

export default function FeedbackBoard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  // The open item and the status filter live in the URL, so a selected item
  // can be shared (/feedback?item=<id>) and survives the trip through sign-in.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('item');
  const statusFilter = searchParams.get('status') ?? 'all';

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Fetch all feedback submissions
  const {
    data: items = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback-board'],
    queryFn: () => fetchFeedbackBoardItems<FeedbackItem>(),
  });

  // Batch vote counts — SIGNED-IN ONLY, and the gate is not an optimisation.
  // `feedback_votes` is `anon=a/postgres` with no SELECT, so for an anonymous
  // visitor this hook threw 42501 on every board load; the only thing it adds
  // over the view's own `vote_count` is `hasVoted`, which is meaningless without
  // a user. Passing [] disables the query (`enabled: ids.length > 0`), so anon
  // now makes exactly one request instead of one plus a 401.
  const submissionIds = useMemo(() => (user ? items.map((i) => i.id) : []), [items, user]);
  const { data: votesMap = {} } = useFeedbackVoteCounts(submissionIds);

  // The view's aggregate is the baseline; the signed-in hook wins when present
  // so an optimistic toggle still moves the number it just changed.
  const voteCountFor = useCallback(
    (item: FeedbackItem) => votesMap[item.id]?.count ?? item.vote_count ?? 0,
    [votesMap],
  );

  // Group items by column, sort by votes (desc)
  const grouped = useMemo(() => {
    const map: Record<string, FeedbackItem[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const item of items) {
      const status = item.feedback_status || 'new';
      if (map[status]) map[status].push(item);
      else map.new.push(item);
    }
    for (const col of columns) {
      map[col.id].sort((a, b) => voteCountFor(b) - voteCountFor(a));
    }
    return map;
  }, [items, voteCountFor]);

  const voteMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      if (!user) throw new Error('Login required');
      const voteState = votesMap[submissionId];
      await toggleFeedbackVote(submissionId, user.id, !!voteState?.hasVoted);
    },
    onError: () => {
      toast({
        title: t('feedback.voteFailed', 'Your vote did not save'),
        description: t('feedback.voteFailedBody', 'Nothing changed. Try again.'),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-votes'] });
    },
  });

  const handleVote = useCallback(
    (id: string) => {
      if (!user) {
        // Come back to the same item after signing in.
        navigate(`/auth?redirect=${encodeURIComponent(`/feedback?item=${id}`)}`);
        return;
      }
      voteMutation.mutate(id);
    },
    [user, voteMutation, navigate],
  );

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const visibleColumns = columns.filter((c) => statusFilter === 'all' || c.id === statusFilter);

  if (isLoading) {
    return (
      <PageContainer className="text-center">
        <TrackLoader size={32} label="Loading" className="mx-auto" />
      </PageContainer>
    );
  }

  const sendFeedback = (
    <Button asChild>
      <LocalizedLink to="/submit/feedback">{t('feedback.send', 'Send feedback')}</LocalizedLink>
    </Button>
  );

  return (
    <PageContainer flush className="py-4">
      <PageHeader
        title="Community Feedback"
        subtitle="Ideas, bugs, and improvements from the community. Vote on what matters most."
      />
      {items.length > 0 && <div className="mt-4">{sendFeedback}</div>}

      {isError ? (
        <div className="mt-6">
          <EmptyState
            icon={Lightbulb}
            title={t('feedback.loadFailed', 'The feedback board did not load')}
            description={t('feedback.loadFailedBody', 'Check your connection and try again.')}
            mood="neutral"
            primaryAction={{
              label: t('common.tryAgain', 'Try again'),
              onClick: () => void refetch(),
            }}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Lightbulb}
            title={t('feedback.emptyTitle', 'No feedback yet.')}
            description={t(
              'feedback.emptyBody',
              'Found a bug or have an idea? Send it and it appears here for others to vote on.',
            )}
            mood="neutral"
            primaryAction={{
              label: t('feedback.send', 'Send feedback'),
              onClick: () => navigate('/submit/feedback'),
            }}
          />
        </div>
      ) : (
        <>
          {/* Status filter: one list at a time instead of five stacked columns on a phone. */}
          <div
            role="group"
            aria-label={t('feedback.filterLabel', 'Filter by status')}
            className="mt-6 flex flex-wrap gap-2"
          >
            {[{ id: 'all', label: 'All' }, ...columns].map((c) => {
              const count = c.id === 'all' ? items.length : (grouped[c.id]?.length ?? 0);
              const active = statusFilter === c.id;
              return (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => updateParam('status', c.id === 'all' ? null : c.id)}
                >
                  {c.label} <span className="tabular-nums">{count}</span>
                </Button>
              );
            })}
          </div>

          {/* Kanban board */}
          <div
            className="grid gap-4 mt-6"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}
          >
            {visibleColumns.map((col) => {
              const colItems = grouped[col.id] || [];
              return (
                // An empty column is hidden on phones, where columns stack.
                <div key={col.id} className={cn(colItems.length === 0 && 'hidden md:block')}>
                  {/* Column header */}
                  <div
                    className="flex items-center gap-2 mb-4 pb-2 border-b"
                    style={{ borderColor: col.color }}
                  >
                    <p className="text-sm font-bold">{col.label}</p>
                    <Badge className="text-2xs" variant="secondary">
                      {colItems.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 md:max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                    {colItems.length === 0 && (
                      <p className="py-6 text-center text-xs2 text-muted-foreground">
                        {t('feedback.columnEmpty', 'Nothing here yet.')}
                      </p>
                    )}
                    {colItems.map((item) => (
                      <FeedbackCard
                        key={item.id}
                        item={item}
                        voteCount={voteCountFor(item)}
                        hasVoted={votesMap[item.id]?.hasVoted ?? false}
                        onVote={() => handleVote(item.id)}
                        onClick={() => updateParam('item', item.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Detail dialog, opened from ?item=<id> so the link can be shared. */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) updateParam('item', null);
        }}
      >
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
                      style={{ borderColor: cat.color, color: cat.color, alignItems: 'center' }}
                      className="inline-flex gap-1"
                    >
                      <Icon style={{ width: 12, height: 12 }} />
                      {cat.label}
                    </Badge>
                  );
                })()}
                {(() => {
                  const col = columns.find((c) => c.id === selectedItem.feedback_status);
                  return col ? (
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: col.color }}
                      className="text-background"
                    >
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    ...(votesMap[selectedItem.id]?.hasVoted
                      ? {
                          backgroundColor: 'hsl(var(--foreground))',
                          color: 'hsl(var(--background))',
                        }
                      : {}),
                  }}
                >
                  <ChevronUp size={14} />
                  {voteCountFor(selectedItem)} vote
                  {voteCountFor(selectedItem) !== 1 ? 's' : ''}
                </Button>
                {!user && (
                  <span className="text-xs text-muted-foreground">
                    {t('feedback.signInToVote', 'Voting takes you to sign in and back here.')}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <Clock size={12} className="text-muted-foreground" />
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
    </PageContainer>
  );
}
