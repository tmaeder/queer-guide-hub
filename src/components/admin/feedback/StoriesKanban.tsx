import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import { MessageSquare, AlertTriangle, Archive, CheckSquare } from 'lucide-react';
import { storyColumns, priorityFor } from './constants';
import type {
  AdminProfile,
  FeedbackRetestRun,
  FeedbackRoutineRun,
  StoryStatus,
  StoryWithCounts,
} from './types';
import { getStoryPhase, PHASE_COLORS, PHASE_LABELS } from './storyPhase';
import { useArchiveStory, useLatestRunsByStory } from '@/hooks/useStoryRoutine';

interface Props {
  grouped: Record<StoryStatus, StoryWithCounts[]>;
  adminById: Record<string, AdminProfile>;
  onStoryClick: (story: StoryWithCounts) => void;
}

/**
 * Stories-first kanban. Each card shows:
 *   brief_title  |  P-stripe
 *   "As a X, I Y, so that Z."   (narrative, italic, 2-line clamp)
 *   N feedback · M errors  ·  assignee
 *
 * Falls back to `title` when the narrate function hasn't filled in brief_title
 * yet, so cards never look broken on first render.
 */
export function StoriesKanban({ grouped, adminById, onStoryClick }: Props) {
  const allStoryIds = useMemo(
    () =>
      Object.values(grouped)
        .flat()
        .map((s) => s.id),
    [grouped],
  );
  const { data: latest } = useLatestRunsByStory(allStoryIds);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const archive = useArchiveStory();

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleArchiveSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Archive ${selected.size} story${selected.size === 1 ? '' : 'ies'}?`)) return;
    const ids = Array.from(selected);
    for (const id of ids) {
      await archive.mutateAsync({ storyId: id, reason: 'Bulk archive' }).catch(() => null);
    }
    setSelected(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        data-testid="stories-kanban-toolbar"
      >
        {!selectMode ? (
          <Button
            size="small"
            variant="text"
            startIcon={<CheckSquare size={14} />}
            onClick={() => setSelectMode(true)}
            data-testid="enter-select-mode"
          >
            Select
          </Button>
        ) : (
          <>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {selected.size} selected
            </Typography>
            <Button
              size="small"
              variant="contained"
              color="warning"
              startIcon={<Archive size={14} />}
              disabled={selected.size === 0 || archive.isPending}
              onClick={handleArchiveSelected}
              data-testid="bulk-archive"
            >
              {archive.isPending ? 'Archiving…' : 'Archive selected'}
            </Button>
            <Button size="small" variant="text" onClick={exitSelectMode}>
              Cancel
            </Button>
          </>
        )}
      </Box>
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: `repeat(${storyColumns.length}, minmax(0,1fr))` },
        gap: 2,
      }}
    >
      {storyColumns.map((col) => {
        const items = grouped[col.id] ?? [];
        return (
          <Box key={col.id} sx={{ minWidth: 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1.5,
                px: 1,
                py: 0.75,
                borderTop: 3,
                borderColor: col.color,
                bgcolor: `color-mix(in srgb, ${col.color} 9%, transparent)`,
                borderRadius: '0 0 4px 4px',
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: col.color, letterSpacing: 0.3 }}
              >
                {col.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {items.length}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {items.length === 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ py: 3, textAlign: 'center', fontSize: '0.7rem', opacity: 0.5 }}
                >
                  —
                </Typography>
              )}
              {items.map((story) => {
                const run = latest?.runByStory[story.id] ?? null;
                const retest = run ? latest?.retestByRun[run.id] ?? null : null;
                const isSelected = selected.has(story.id);
                return (
                  <StoryCard
                    key={story.id}
                    story={story}
                    assignee={story.assignee_id ? adminById[story.assignee_id] ?? null : null}
                    latestRun={run}
                    latestRetest={retest}
                    selectMode={selectMode}
                    selected={isSelected}
                    onClick={() => {
                      if (selectMode) toggleSelected(story.id);
                      else onStoryClick(story);
                    }}
                  />
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
    </Box>
  );
}

function StoryCard({
  story,
  assignee,
  latestRun,
  latestRetest,
  selectMode,
  selected,
  onClick,
}: {
  story: StoryWithCounts;
  assignee: AdminProfile | null;
  latestRun: FeedbackRoutineRun | null;
  latestRetest: FeedbackRetestRun | null;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const prio = priorityFor(story.priority);
  const isUrgent = story.priority <= 1;
  const stripeWidth = story.priority === 0 ? 4 : story.priority === 1 ? 2 : 0;
  const displayTitle = story.brief_title || story.title;
  const narrative = story.narrative;
  const phase = getStoryPhase(story, latestRun, latestRetest, story.member_count);
  const showPhaseChip = phase !== 'awaiting_review' && phase !== 'resolved';

  return (
    <Box
      onClick={onClick}
      data-testid={selectMode ? `selectable-story-${story.id}` : undefined}
      sx={{
        position: 'relative',
        py: 0.875,
        pl: stripeWidth ? 1.25 : 1,
        pr: 1,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': { borderColor: 'primary.main' },
        ...(stripeWidth && {
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: stripeWidth,
            bgcolor: prio.color,
          },
        }),
      }}
    >
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: narrative ? 0.5 : 0 }}>
        {selectMode && (
          <Checkbox
            checked={selected}
            tabIndex={-1}
            size="small"
            sx={{ p: 0, mr: 0.25, '& .MuiSvgIcon-root': { fontSize: 16 } }}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onClick()}
          />
        )}
        {isUrgent && (
          <Tooltip title={prio.label}>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                px: 0.375,
                borderRadius: 0.375,
                bgcolor: prio.color,
                color: '#fff',
                fontSize: '0.55rem',
                fontWeight: 700,
                letterSpacing: 0.3,
                flexShrink: 0,
              }}
            >
              {prio.short}
            </Box>
          </Tooltip>
        )}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: 600,
            fontSize: '0.8rem',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            minWidth: 0,
          }}
        >
          {displayTitle}
        </Typography>
      </Box>

      {/* Narrative */}
      {narrative && (
        <Typography
          variant="caption"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            color: 'text.secondary',
            fontStyle: 'italic',
            fontSize: '0.68rem',
            lineHeight: 1.35,
            mb: 0.75,
          }}
        >
          {narrative}
        </Typography>
      )}

      {/* Footer: source counts · labels · assignee */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          color: 'text.secondary',
          fontSize: '0.6rem',
        }}
      >
        {story.feedback_count > 0 && (
          <Tooltip title={`${story.feedback_count} feedback item${story.feedback_count === 1 ? '' : 's'}`}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
              <MessageSquare size={10} />
              {story.feedback_count}
            </Box>
          </Tooltip>
        )}
        {story.error_count > 0 && (
          <Tooltip title={`${story.error_count} API error${story.error_count === 1 ? '' : 's'}`}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                flexShrink: 0,
                color: '#ef4444',
              }}
            >
              <AlertTriangle size={10} />
              {story.error_count}
            </Box>
          </Tooltip>
        )}

        {story.labels.length > 0 && (
          <Tooltip title={story.labels.join(', ')}>
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
                maxWidth: 70,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {story.labels.length === 1 ? story.labels[0] : `${story.labels.length} tags`}
            </Box>
          </Tooltip>
        )}

        {story.origin === 'ai_suggested' && (
          <Tooltip title="Auto-detected cluster">
            <Box
              component="span"
              sx={{
                px: 0.5,
                fontSize: '0.55rem',
                color: 'hsl(var(--accent-warm))',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              AI
            </Box>
          </Tooltip>
        )}

        {showPhaseChip && (
          <Tooltip title={`Phase: ${PHASE_LABELS[phase]}`}>
            <Box
              component="span"
              data-testid="story-phase-chip"
              data-phase={phase}
              sx={{
                px: 0.5,
                py: 0.125,
                fontSize: '0.55rem',
                fontWeight: 700,
                color: PHASE_COLORS[phase],
                bgcolor: `color-mix(in srgb, ${PHASE_COLORS[phase]} 14%, transparent)`,
                border: `1px solid ${PHASE_COLORS[phase]}`,
                borderRadius: 0.5,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {PHASE_LABELS[phase]}
            </Box>
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        {assignee && (
          <Tooltip title={`Assigned to ${assignee.display_name ?? 'admin'}`}>
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
  );
}
