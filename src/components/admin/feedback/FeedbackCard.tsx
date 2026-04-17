import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { ChevronUp, Clock, Github, Camera, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const Icon = cat.icon;
  const prio = priorityFor(item.priority);
  const isForwarded = !!item.github_issue_url;
  // "With Claude" = forwarded + not yet resolved. Surfaces Claude's active work
  // as a distinct card state between 'planned' and 'done'.
  const withClaude = isForwarded && item.feedback_status !== 'done';
  const errorCount = item.data.context?.errors?.length ?? 0;
  const hasScreenshot = !!item.data.screenshot_url;

  // SLA severity: warn at 3d, alert at 7d, critical at 14d. Only computed for
  // open, non-spam, non-duplicate rows so closed tickets don't glow red.
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
          p: 1.25,
          pl: 1.75,
          borderRadius: 1.5,
          border: 1,
          borderColor: focused ? 'primary.main' : selected ? 'primary.light' : 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
          cursor: 'pointer',
          display: 'flex',
          gap: 1.25,
          transition: 'all 0.15s',
          boxShadow: focused ? 2 : 0,
          '&:hover': { borderColor: 'primary.main' },
          // Priority stripe — primary scanning signal at the card's leading edge.
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            bgcolor: prio.color,
            borderTopLeftRadius: 'inherit',
            borderBottomLeftRadius: 'inherit',
          },
          // "New since session start" pulse — draws attention to realtime arrivals
          // until the admin opens the drawer once.
          ...(isNew && {
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'hsl(var(--accent-warm))',
              boxShadow: '0 0 0 0 hsl(var(--accent-warm) / 0.7)',
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
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            minWidth: 28,
            pt: 0.25,
          }}
        >
          <Checkbox
            size="small"
            checked={selected}
            onClick={onToggleSelect}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{ p: 0.25 }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ChevronUp style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.65rem' }}>
              {voteCount}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
            <Tooltip title={`${prio.short} · ${prio.label}`}>
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
            </Tooltip>
            <Badge
              variant="outline"
              style={{
                borderColor: cat.color,
                color: cat.color,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.6rem',
                padding: '1px 5px',
              }}
            >
              <Icon style={{ width: 10, height: 10 }} />
              {cat.label}
            </Badge>
            {isForwarded && (
              <Tooltip
                title={
                  withClaude
                    ? `Claude picked this up — GitHub #${item.github_issue_number}`
                    : `Forwarded to GitHub #${item.github_issue_number}`
                }
              >
                <Badge
                  variant="outline"
                  style={{
                    borderColor: withClaude ? '#8b5cf6' : '#6366f1',
                    color: withClaude ? '#ffffff' : '#6366f1',
                    backgroundColor: withClaude ? '#8b5cf6' : 'transparent',
                    fontSize: '0.55rem',
                    padding: '1px 4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    fontWeight: withClaude ? 700 : 400,
                  }}
                >
                  <Github style={{ width: 9, height: 9 }} />
                  {withClaude ? `Claude · #${item.github_issue_number}` : `#${item.github_issue_number}`}
                </Badge>
              </Tooltip>
            )}
            {item.labels?.slice(0, 3).map((l) => (
              <Box
                key={l}
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.125,
                  fontSize: '0.55rem',
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                  borderRadius: 0.5,
                }}
              >
                {l}
              </Box>
            ))}
            {(item.labels?.length ?? 0) > 3 && (
              <Tooltip title={(item.labels ?? []).slice(3).join(', ')}>
                <Box
                  component="span"
                  sx={{
                    px: 0.75,
                    py: 0.125,
                    fontSize: '0.55rem',
                    bgcolor: 'action.hover',
                    color: 'text.secondary',
                    borderRadius: 0.5,
                  }}
                >
                  +{(item.labels?.length ?? 0) - 3}
                </Box>
              </Tooltip>
            )}
          </Box>

          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              mb: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.8rem',
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
              lineHeight: 1.35,
              fontSize: '0.7rem',
            }}
          >
            {item.data.description}
          </Typography>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mt: 0.75,
              flexWrap: 'wrap',
            }}
          >
            <Tooltip
              title={
                slaColor
                  ? `Overdue: open ${Math.floor(ageDays)}d — auto-escalates nightly`
                  : `Submitted ${timeAgo(item.submitted_at)}`
              }
            >
              <Box
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                <Clock
                  style={{
                    width: 10,
                    height: 10,
                    color: slaColor ?? 'var(--muted-foreground)',
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.6rem',
                    color: slaColor ?? 'text.secondary',
                    fontWeight: slaColor ? 700 : 400,
                  }}
                >
                  {timeAgo(item.submitted_at)}
                </Typography>
              </Box>
            </Tooltip>
            {hasScreenshot && (
              <Camera style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
            )}
            {errorCount > 0 && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                <AlertTriangle style={{ width: 10, height: 10, color: '#ef4444' }} />
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#ef4444' }}>
                  {errorCount}
                </Typography>
              </Box>
            )}

            <Box sx={{ flex: 1 }} />

            {watchers.length > 0 && (
              <Tooltip
                title={`Being viewed: ${watchers
                  .map((w) => w.display_name || w.user_id)
                  .join(', ')}`}
              >
                <AvatarGroup
                  max={3}
                  sx={{
                    '& .MuiAvatar-root': {
                      width: 16,
                      height: 16,
                      fontSize: '0.55rem',
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
                  sx={{ width: 18, height: 18, fontSize: '0.6rem' }}
                >
                  {(assignee.display_name || '?').slice(0, 1).toUpperCase()}
                </Avatar>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Box>
    </div>
  );
}
