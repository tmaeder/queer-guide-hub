import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { ChevronUp, Clock, Github, Camera, AlertTriangle } from 'lucide-react';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';
import { priorityFor } from './constants';
import { latestHandoff } from '@/hooks/useFeedbackHandoff';
import type { AdminProfile, FeedbackSubmission } from './types';

const HANDOFF_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  sent: { label: 'Sent', color: '#fff', bg: '#3b82f6' },
  in_progress: { label: 'Working', color: '#fff', bg: '#f59e0b' },
  resolved: { label: 'Resolved', color: '#fff', bg: '#22c55e' },
  failed: { label: 'Failed', color: '#fff', bg: '#ef4444' },
};

interface Props {
  item: FeedbackSubmission;
  voteCount: number;
  selected: boolean;
  focused: boolean;
  watchers: AdminProfile[];
  assignee: AdminProfile | null;
  isNew?: boolean;
  onClick: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
}

/**
 * Compact card layout optimised for narrow kanban columns (~150px wide).
 * Title wraps up to 2 lines, description lives in the drawer, secondary
 * metadata collapses into icon-only tooltips in a single footer row.
 */
export function FeedbackCard({
  item,
  voteCount,
  selected,
  focused,
  watchers,
  assignee,
  isNew = false,
  onClick,
  onToggleSelect,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const CatIcon = cat.icon;
  const prio = priorityFor(item.priority);
  const isForwarded = !!item.github_issue_url;
  const withClaude = isForwarded && item.feedback_status !== 'done';
  const errorCount = item.data.context?.errors?.length ?? 0;
  const hasScreenshot = !!item.data.screenshot_url;
  // Handoff chip beats GitHub chip when both are set — handoffs are the
  // primary signal for "this has been passed to someone".
  const handoff = latestHandoff(item);
  const handoffChip = handoff ? HANDOFF_CHIP[handoff.status] : null;

  const ageMs = Date.now() - new Date(item.submitted_at).getTime();
  const ageDays = ageMs / 86400_000;
  const slaOpen =
    item.feedback_status !== 'done' && !item.is_spam && !item.duplicate_of;
  const slaColor =
    slaOpen && ageDays >= 14
      ? '#dc2626'
      : slaOpen && ageDays >= 7
        ? '#f97316'
        : slaOpen && ageDays >= 3
          ? '#f59e0b'
          : null;

  // Only P0 and P1 get visible priority markers. P2 (default) and P3
  // inherit the neutral card chrome — priority should mean "urgent", not
  // decorate every card.
  const isUrgent = item.priority <= 1;
  const stripeWidth = item.priority === 0 ? 4 : item.priority === 1 ? 2 : 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box
        onClick={onClick}
        sx={{
          position: 'relative',
          py: 0.625,
          pl: stripeWidth ? 1 : 0.875,
          pr: 0.75,
          borderRadius: 1,
          border: 1,
          borderColor: focused
            ? 'primary.main'
            : selected
              ? 'primary.light'
              : 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
          cursor: 'pointer',
          transition: 'all 0.15s',
          boxShadow: focused ? 2 : 0,
          '&:hover': {
            borderColor: 'primary.main',
            '& .hover-checkbox': { opacity: 1 },
          },
          ...(stripeWidth && {
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: stripeWidth,
              bgcolor: prio.color,
              borderTopLeftRadius: 'inherit',
              borderBottomLeftRadius: 'inherit',
            },
          }),
          ...(isNew && {
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 4,
              right: 4,
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'hsl(var(--accent-warm))',
              animation: 'feedback-pulse 1.8s infinite',
            },
            '@keyframes feedback-pulse': {
              '0%': { boxShadow: '0 0 0 0 hsl(var(--accent-warm) / 0.6)' },
              '70%': { boxShadow: '0 0 0 6px hsl(var(--accent-warm) / 0)' },
              '100%': { boxShadow: '0 0 0 0 hsl(var(--accent-warm) / 0)' },
            },
          }),
        }}
      >
        {/* Title row — category icon inline, urgent P0/P1 tag, hover checkbox */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.625, mb: 0.375 }}>
          <Tooltip title={cat.label}>
            <CatIcon
              style={{
                width: 12,
                height: 12,
                color: cat.color,
                flexShrink: 0,
                marginTop: 2,
              }}
            />
          </Tooltip>

          <Typography
            variant="body2"
            sx={{
              flex: 1,
              fontWeight: 600,
              fontSize: '0.78rem',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
              minWidth: 0,
            }}
          >
            {isUrgent && (
              <Tooltip title={prio.label}>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    mr: 0.5,
                    px: 0.375,
                    borderRadius: 0.375,
                    bgcolor: prio.color,
                    color: '#fff',
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    verticalAlign: '2px',
                  }}
                >
                  {prio.short}
                </Box>
              </Tooltip>
            )}
            {item.data.title}
          </Typography>

          <Checkbox
            className="hover-checkbox"
            size="small"
            checked={selected}
            onClick={onToggleSelect}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{
              p: 0,
              mt: '1px',
              opacity: selected ? 1 : 0,
              transition: 'opacity 0.15s',
              flexShrink: 0,
              '& svg': { width: 14, height: 14 },
            }}
          />
        </Box>

        {/* Footer — single row, icons only, everything tooltipped */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.625,
            color: 'text.secondary',
            fontSize: '0.6rem',
          }}
        >
          <Tooltip
            title={
              slaColor
                ? `Open ${Math.floor(ageDays)}d — auto-escalates nightly`
                : `Submitted ${timeAgo(item.submitted_at)}`
            }
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6rem',
                color: slaColor ?? 'inherit',
                fontWeight: slaColor ? 700 : 400,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                flexShrink: 0,
              }}
            >
              {slaColor && <Clock style={{ width: 10, height: 10 }} />}
              {timeAgo(item.submitted_at)}
            </Typography>
          </Tooltip>

          {handoffChip ? (
            <Tooltip
              title={
                handoff
                  ? `${handoffChip.label} — ${handoff.target} ${timeAgo(handoff.at)}`
                  : ''
              }
            >
              <Box
                component="span"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: handoffChip.bg,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          ) : (
            isForwarded && (
              <Tooltip title={`GitHub #${item.github_issue_number}${withClaude ? ' (open)' : ''}`}>
                <Github style={{ width: 10, height: 10, color: '#6366f1', flexShrink: 0 }} />
              </Tooltip>
            )
          )}

          {hasScreenshot && (
            <Tooltip title="Screenshot attached">
              <Camera style={{ width: 10, height: 10, flexShrink: 0 }} />
            </Tooltip>
          )}

          {errorCount > 0 && (
            <Tooltip title={`${errorCount} console error${errorCount === 1 ? '' : 's'}`}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.125,
                  color: '#ef4444',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle style={{ width: 10, height: 10 }} />
                {errorCount}
              </Box>
            </Tooltip>
          )}

          {(item.labels?.length ?? 0) > 0 && (
            <Tooltip title={(item.labels ?? []).join(', ')}>
              <Box
                component="span"
                sx={{
                  px: 0.5,
                  py: 0.125,
                  fontSize: '0.55rem',
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                  borderRadius: 0.5,
                  flexShrink: 0,
                  maxWidth: 60,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.labels!.length === 1 ? item.labels![0] : `${item.labels!.length}`}
              </Box>
            </Tooltip>
          )}

          {voteCount > 0 && (
            <Tooltip title={`${voteCount} vote${voteCount === 1 ? '' : 's'}`}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.125,
                  flexShrink: 0,
                }}
              >
                <ChevronUp style={{ width: 10, height: 10 }} />
                {voteCount}
              </Box>
            </Tooltip>
          )}

          <Box sx={{ flex: 1 }} />

          {watchers.length > 0 && (
            <Tooltip
              title={`Viewing: ${watchers.map((w) => w.display_name || w.user_id).join(', ')}`}
            >
              <AvatarGroup
                max={2}
                sx={{
                  '& .MuiAvatar-root': {
                    width: 14,
                    height: 14,
                    fontSize: '0.5rem',
                    border: '1px solid var(--background)',
                  },
                }}
              >
                {watchers.map((w) => (
                  <Avatar key={w.user_id} src={w.avatar_url || undefined}>
                    {(w.display_name || '?').slice(0, 1).toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
            </Tooltip>
          )}

          {assignee && (
            <Tooltip title={`Assigned to ${assignee.display_name || 'admin'}`}>
              <Avatar
                src={assignee.avatar_url || undefined}
                sx={{ width: 16, height: 16, fontSize: '0.55rem' }}
              >
                {(assignee.display_name || '?').slice(0, 1).toUpperCase()}
              </Avatar>
            </Tooltip>
          )}
        </Box>
      </Box>
    </div>
  );
}
