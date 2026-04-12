/**
 * ReviewItemCard — Unified card component for all review queues.
 *
 * Renders content preview, status badge, sensitivity flags, relevance score,
 * and action buttons. Used across all Review Hub tabs.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import { Check, X, Eye, AlertTriangle } from 'lucide-react';
import { SensitivityBadges } from '@/components/ui/ContentWarningBanner';

export interface ReviewItem {
  id: string;
  title: string;
  subtitle?: string;
  content_type: string;
  status: string;
  created_at: string;
  relevance_score?: number | null;
  sensitivity_flags?: Array<{ category: string; severity: string }> | null;
  reasoning?: string;
  meta?: Record<string, unknown>;
}

interface ReviewItemCardProps {
  item: ReviewItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onView?: (id: string) => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  // Tier 1 (Import)
  pending: 'warning',
  review: 'info',
  approved: 'success',
  rejected: 'error',
  // Tier 2 (Editorial)
  draft: 'default',
  published: 'success',
  archived: 'default',
  // Tier 3 (Flags)
  open: 'warning',
  OPEN: 'warning',
  in_review: 'info',
  IN_REVIEW: 'info',
  resolved: 'success',
  RESOLVED: 'success',
  dismissed: 'default',
  REJECTED: 'error',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  news_articles: 'News',
  personalities: 'Person',
  marketplace_listings: 'Listing',
};

export const ReviewItemCard: React.FC<ReviewItemCardProps> = ({
  item,
  selected,
  onSelect,
  onApprove,
  onReject,
  onView,
  compact = false,
}) => {
  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'all 150ms',
      }}
    >
      <CardContent sx={{ py: compact ? 1 : 1.5, px: 2, '&:last-child': { pb: compact ? 1 : 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {/* Selection checkbox */}
          {onSelect && (
            <Checkbox
              checked={selected}
              onChange={() => onSelect(item.id)}
              size="small"
              sx={{ p: 0, mt: 0.25 }}
            />
          )}

          {/* Main content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                noWrap
                sx={{ flex: 1 }}
              >
                {item.title}
              </Typography>

              {/* Content type chip */}
              <Chip
                label={CONTENT_TYPE_LABELS[item.content_type] || item.content_type}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />

              {/* Status chip */}
              <Chip
                label={item.status}
                size="small"
                color={STATUS_COLORS[item.status] || 'default'}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            </Box>

            {/* Subtitle and meta */}
            {item.subtitle && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {item.subtitle}
              </Typography>
            )}

            {/* Sensitivity badges + relevance score */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <SensitivityBadges
                sensitivityFlags={item.sensitivity_flags}
                relevanceScore={item.relevance_score}
              />

              {item.reasoning && (
                <Tooltip title={item.reasoning}>
                  <AlertTriangle size={14} style={{ color: '#d97706', cursor: 'help' }} />
                </Tooltip>
              )}

              <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                {new Date(item.created_at).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
            {onView && (
              <Tooltip title="View">
                <IconButton size="small" onClick={() => onView(item.id)}>
                  <Eye size={16} />
                </IconButton>
              </Tooltip>
            )}
            {onApprove && (
              <Tooltip title="Approve">
                <IconButton
                  size="small"
                  onClick={() => onApprove(item.id)}
                  sx={{ color: 'success.main' }}
                >
                  <Check size={16} />
                </IconButton>
              </Tooltip>
            )}
            {onReject && (
              <Tooltip title="Reject">
                <IconButton
                  size="small"
                  onClick={() => onReject(item.id)}
                  sx={{ color: 'error.main' }}
                >
                  <X size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ReviewItemCard;
