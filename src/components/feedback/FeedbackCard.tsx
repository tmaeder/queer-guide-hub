import { useCallback } from 'react';
import { ChevronUp, Clock } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { Badge } from '@/components/ui/badge';
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
    <Box
      onClick={onClick}
      sx={{
        p: 1.5,
        bgcolor: 'background.paper',
        cursor: 'pointer',
        display: 'flex',
        gap: 1.5,
        transition: 'all 0.15s',
      }}
    >
      {/* Vote column */}
      <Tooltip title={user ? (hasVoted ? 'Remove vote' : 'Upvote') : 'Log in to vote'}>
        <Box
          onClick={handleVoteClick}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.25,
            minWidth: 36,
            pt: 0.25,
            cursor: 'pointer',
          }}
        >
          <ChevronUp
            style={{
              width: 18,
              height: 18,
              color: hasVoted ? '#DB2777' : 'var(--muted-foreground)',
              transition: 'color 0.15s',
            }}
          />
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: hasVoted ? '#DB2777' : 'text.secondary' }}
          >
            {voteCount}
          </Typography>
        </Box>
      </Tooltip>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
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
