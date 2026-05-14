import { useCallback } from 'react';
import { ChevronUp, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';

export interface FeedbackItem {
  id: string;
  data: {
    title: string;
    description: string;
    category: string;
    contact_email?: string;
  };
  submitted_at: string;
  feedback_status: string;
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
        className="p-3 bg-background cursor-pointer flex gap-3 transition-all"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={handleVoteClick}
              className="flex flex-col items-center gap-0.5 pt-0.5 cursor-pointer"
              style={{ minWidth: 36 }}
            >
              <ChevronUp
                style={{
                  width: 18,
                  height: 18,
                  color: hasVoted ? 'hsl(var(--foreground))' : 'var(--muted-foreground)',
                  transition: 'color 0.15s',
                }}
              />
              <span
                className="text-xs font-bold"
                style={{ color: hasVoted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
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
          </div>
          <p className="text-sm font-semibold mb-0.5 truncate">{item.data.title}</p>
          <p
            className="text-xs text-muted-foreground"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
            }}
          >
            {item.data.description}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Clock style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
            <span className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
              {timeAgo(item.submitted_at)}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
