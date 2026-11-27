import { useCallback } from 'react';
import { ChevronUp, Clock } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';

/**
 * One row of `feedback_board_v`. `data` holds exactly the three keys that view
 * publishes. `contact_email` was declared here and is deliberately gone: the
 * view never returns it — nor `context`, `screenshot_url`, `handoffs`, `replies`
 * or `review_notes` — so the field would be permanently undefined while reading
 * as "the public board may show a submitter's email". The admin surface keeps
 * its own type for the full row (components/admin/feedback/types.ts).
 */
export interface FeedbackItem {
  id: string;
  data: {
    title: string;
    description: string;
    category: string;
  };
  submitted_at: string;
  feedback_status: string;
  /** Aggregated by the view, so anon gets counts without reading feedback_votes. */
  vote_count?: number;
}

interface FeedbackCardProps {
  item: FeedbackItem;
  voteCount: number;
  hasVoted: boolean;
  onVote: () => void;
  onClick: () => void;
}

export function FeedbackCard({ item, voteCount, hasVoted, onVote, onClick }: FeedbackCardProps) {
  const { user } = useAuth();
  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const Icon = cat.icon;

  const handleVoteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onVote();
    },
    [onVote],
  );

  return (
    <TooltipProvider>
      {/* The whole card opens the detail through an overlay button that is a
          SIBLING of the vote button, never its parent: a vote control inside a
          role="button" card is nested-interactive (WCAG 4.1.2). */}
      <div className="relative p-4 bg-background flex gap-4 transition-all">
        <button
          type="button"
          onClick={onClick}
          aria-label={item.data.title}
          className="absolute inset-0 min-h-0 cursor-pointer rounded-element focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleVoteClick}
              // The visible text is the count, so the name must contain it
              // (label-content-name-mismatch).
              aria-label={`${voteCount} ${hasVoted ? 'Remove vote' : 'Upvote'}`}
              className="relative z-10 flex min-h-0 flex-col items-center gap-0.5 pt-0.5 cursor-pointer self-start rounded-element focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ minWidth: 36 }}
            >
              <ChevronUp
                size={18}
                className="transition-colors duration-fast"
                style={{
                  color: hasVoted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                }}
              />
              <span
                className="text-xs font-bold"
                style={{
                  color: hasVoted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                }}
              >
                {voteCount}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {user ? (hasVoted ? 'Remove vote' : 'Upvote') : 'Log in to vote'}
          </TooltipContent>
        </Tooltip>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Badge
              variant="outline"
              style={{
                borderColor: cat.color,
                color: cat.color,
                alignItems: 'center',
                gap: 3,
                padding: '1px 6px',
              }}
              className="text-2xs inline-flex"
            >
              <Icon style={{ width: 10, height: 10 }} />
              {cat.label}
            </Badge>
          </div>
          <p className="text-sm font-semibold mb-0.5 truncate">{item.data.title}</p>
          <p
            className="text-xs text-muted-foreground overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.4,
            }}
          >
            {item.data.description}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="text-2xs text-muted-foreground">{timeAgo(item.submitted_at)}</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
