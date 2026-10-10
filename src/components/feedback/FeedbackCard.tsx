import { useCallback } from 'react';
import { ChevronUp, Clock } from 'lucide-react';
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
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onVote();
    },
    [onVote],
  );

  return (
    <TooltipProvider>
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        role="button"
        tabIndex={0}
        className="p-4 bg-background cursor-pointer flex gap-4 transition-all"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={handleVoteClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleVoteClick(e as unknown as React.MouseEvent);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={hasVoted ? 'Remove vote' : 'Upvote'}
              className="flex flex-col items-center gap-0.5 pt-0.5 cursor-pointer"
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
            </div>
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
