import { useState, type MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
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
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Tooltip title="Good match">
        <IconButton
          size="small"
          onClick={cast('up')}
          sx={{
            color: voted === 'up' ? 'primary.main' : 'text.secondary',
            opacity: voted && voted !== 'up' ? 0.4 : 1,
          }}
          aria-label="Thumbs up"
        >
          <ThumbsUp style={{ width: size, height: size }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Not relevant">
        <IconButton
          size="small"
          onClick={cast('down')}
          sx={{
            color: voted === 'down' ? 'error.main' : 'text.secondary',
            opacity: voted && voted !== 'down' ? 0.4 : 1,
          }}
          aria-label="Thumbs down"
        >
          <ThumbsDown style={{ width: size, height: size }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
