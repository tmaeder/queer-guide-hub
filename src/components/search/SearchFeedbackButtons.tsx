import { useState, type MouseEvent } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeedbackVote, type Entity } from '@/hooks/useSearchActions';

interface Props {
  entity: Entity;
  query?: string;
  size?: number;
}

/**
 * Thumbs up / down buttons for search result quality feedback.
 * Fires submitFeedback() via useFeedbackVote — feeds the personalization bias
 * vector. Stops propagation so clicks don't trigger the enclosing card.
 */
export function SearchFeedbackButtons({ entity, query, size = 14 }: Props) {
  const vote = useFeedbackVote();
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  const cast = (direction: 'up' | 'down') => (e: MouseEvent) => {
    e.stopPropagation();
    if (voted === direction) return;
    setVoted(direction);
    vote(entity, direction, query);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <span className="inline-flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={cast('up')}
              aria-label="Thumbs up"
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition"
              style={{
                color: voted === 'up' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                opacity: voted && voted !== 'up' ? 0.4 : 1,
              }}
            >
              <ThumbsUp style={{ width: size, height: size }} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Good match</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={cast('down')}
              aria-label="Thumbs down"
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition"
              style={{
                color: voted === 'down' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
                opacity: voted && voted !== 'down' ? 0.4 : 1,
              }}
            >
              <ThumbsDown style={{ width: size, height: size }} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Not relevant</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
