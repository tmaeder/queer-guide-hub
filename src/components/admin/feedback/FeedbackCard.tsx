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
import type { AdminProfile, FeedbackSubmission } from './types';

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
          py: 0.75,
          pl: 1.25,
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
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            bgcolor: prio.color,
            borderTopLeftRadius: 'inherit',
            borderBottomLeftRadius: 'inherit',
          },
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
        {/* Top row: category icon · priority · claude chip · labels · select */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <Tooltip title={`${cat.label} · ${prio.short} ${prio.label}`}>
            <Box
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }}
            >
              <CatIcon style={{ width: 11, height: 11, color: cat.color }} />
              <Typography
                component="span"
                sx={{
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  color: prio.color,
                  letterSpacing: 0.4,
                }}
              >
                {prio.short}
              </Typography>
            </Box>
          </Tooltip>

          {isForwarded && (
            <Tooltip
              title={
                withClaude
                  ? `Claude on it — #${item.github_issue_number}`
                  : `Forwarded to #${item.github_issue_number}`
              }
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.25,
                  px: 0.5,
                  borderRadius: 0.5,
                  bgcolor: withClaude ? '#8b5cf6' : 'transparent',
                  color: withClaude ? '#fff' : '#6366f1',
                  border: withClaude ? 0 : 1,
                  borderColor: '#6366f1',
                  fontSize: '0.55rem',
                  fontWeight: withClaude ? 700 : 500,
                  flexShrink: 0,
                }}
              >
                <Github style={{ width: 9, height: 9 }} />
                {withClaude ? 'Claude' : `#${item.github_issue_number}`}
              </Box>
            </Tooltip>
          )}

          {/* Label chips — truncate hard, show full list on tooltip */}
          {(item.labels?.length ?? 0) > 0 && (
            <Tooltip title={(item.labels ?? []).join(', ')}>
              <Box
                component="span"
                sx={{
                  px: 0.5,
                  fontSize: '0.55rem',
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                  borderRadius: 0.5,
                  flexShrink: 0,
                }}
              >
                {item.labels!.length === 1
                  ? item.labels![0].slice(0, 8)
                  : `${item.labels!.length} tags`}
              </Box>
            </Tooltip>
          )}

          <Box sx={{ flex: 1 }} />

          <Checkbox
            className="hover-checkbox"
            size="small"
            checked={selected}
            onClick={onToggleSelect}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{
              p: 0,
              opacity: selected ? 1 : 0,
              transition: 'opacity 0.15s',
              '& svg': { width: 14, height: 14 },
            }}
          />
        </Box>

        {/* Title — wraps up to 2 lines */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: '0.78rem',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            mb: 0.5,
          }}
        >
          {item.data.title}
        </Typography>

        {/* Footer row: age · screenshot · errors · votes · watchers · assignee */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexWrap: 'wrap',
            color: 'text.secondary',
          }}
        >
          <Tooltip
            title={
              slaColor
                ? `Open ${Math.floor(ageDays)}d — auto-escalates nightly`
                : `Submitted ${timeAgo(item.submitted_at)}`
            }
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
              <Clock
                style={{ width: 10, height: 10, color: slaColor ?? 'currentColor' }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.6rem',
                  color: slaColor ?? 'inherit',
                  fontWeight: slaColor ? 700 : 400,
                }}
              >
                {timeAgo(item.submitted_at)}
              </Typography>
            </Box>
          </Tooltip>

          {hasScreenshot && (
            <Tooltip title="Includes screenshot">
              <Camera style={{ width: 10, height: 10 }} />
            </Tooltip>
          )}

          {errorCount > 0 && (
            <Tooltip title={`${errorCount} console error${errorCount === 1 ? '' : 's'}`}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.125, color: '#ef4444' }}>
                <AlertTriangle style={{ width: 10, height: 10 }} />
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'inherit' }}>
                  {errorCount}
                </Typography>
              </Box>
            </Tooltip>
          )}

          {voteCount > 0 && (
            <Tooltip title={`${voteCount} vote${voteCount === 1 ? '' : 's'}`}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.125 }}>
                <ChevronUp style={{ width: 10, height: 10 }} />
                <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                  {voteCount}
                </Typography>
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
