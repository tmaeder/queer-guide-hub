import { useMemo, useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2" data-testid="stories-kanban-toolbar">
        {!selectMode ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectMode(true)}
            data-testid="enter-select-mode"
            className="flex gap-1.5"
          >
            <CheckSquare size={14} />
            Select
          </Button>
        ) : (
          <>
            <span className="text-xs font-semibold">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              disabled={selected.size === 0 || archive.isPending}
              onClick={handleArchiveSelected}
              data-testid="bulk-archive"
              className="flex gap-1.5"
              style={{ backgroundColor: '#f59e0b' }}
            >
              <Archive size={14} />
              {archive.isPending ? 'Archiving…' : 'Archive selected'}
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode}>
              Cancel
            </Button>
          </>
        )}
      </div>
      <div
        className="grid gap-4 grid-cols-1"
        style={{ gridTemplateColumns: `repeat(${storyColumns.length}, minmax(0,1fr))` }}
      >
        {storyColumns.map((col) => {
          const items = grouped[col.id] ?? [];
          return (
            <div key={col.id} className="min-w-0">
              <div
                className="flex items-center gap-2 mb-3 px-2 py-1.5"
                style={{
                  borderTop: '3px solid',
                  borderColor: col.color,
                  backgroundColor: `color-mix(in srgb, ${col.color} 9%, transparent)`,
                  borderRadius: '0 0 4px 4px',
                }}
              >
                <p className="text-sm font-bold" style={{ color: col.color, letterSpacing: 0.3 }}>
                  {col.label}
                </p>
                <span className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <span
                    className="text-muted-foreground py-6 text-center"
                    style={{ fontSize: '0.7rem', opacity: 0.5 }}
                  >
                    —
                  </span>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    <div
      onClick={onClick}
      data-testid={selectMode ? `selectable-story-${story.id}` : undefined}
      className={`relative cursor-pointer border ${selected ? 'border-primary bg-muted' : 'border-border bg-background'} hover:border-primary transition-colors`}
      style={{
        paddingTop: 7,
        paddingBottom: 7,
        paddingLeft: stripeWidth ? 10 : 8,
        paddingRight: 8,
      }}
    >
      {stripeWidth > 0 && (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            bottom: 0,
            width: stripeWidth,
            backgroundColor: prio.color,
          }}
        />
      )}
      {/* Title row */}
      <div className="flex items-baseline gap-1.5" style={{ marginBottom: narrative ? 4 : 0 }}>
        {selectMode && (
          <Checkbox
            checked={selected}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() => onClick()}
            style={{ marginRight: 2, height: 16, width: 16 }}
          />
        )}
        {isUrgent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-block rounded-sm flex-shrink-0"
                style={{
                  paddingLeft: 3, paddingRight: 3,
                  backgroundColor: prio.color,
                  color: '#fff',
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                {prio.short}
              </span>
            </TooltipTrigger>
            <TooltipContent>{prio.label}</TooltipContent>
          </Tooltip>
        )}
        <p
          className="flex-1 font-semibold min-w-0"
          style={{
            fontSize: '0.8rem',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {displayTitle}
        </p>
      </div>

      {/* Narrative */}
      {narrative && (
        <span
          className="text-muted-foreground italic block"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '0.68rem',
            lineHeight: 1.35,
            marginBottom: 6,
          }}
        >
          {narrative}
        </span>
      )}

      {/* Footer */}
      <div
        className="flex items-center text-muted-foreground"
        style={{ gap: 6, fontSize: '0.6rem' }}
      >
        {story.feedback_count > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center flex-shrink-0" style={{ gap: 2 }}>
                <MessageSquare size={10} />
                {story.feedback_count}
              </span>
            </TooltipTrigger>
            <TooltipContent>{`${story.feedback_count} feedback item${story.feedback_count === 1 ? '' : 's'}`}</TooltipContent>
          </Tooltip>
        )}
        {story.error_count > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center flex-shrink-0" style={{ gap: 2, color: '#ef4444' }}>
                <AlertTriangle size={10} />
                {story.error_count}
              </span>
            </TooltipTrigger>
            <TooltipContent>{`${story.error_count} API error${story.error_count === 1 ? '' : 's'}`}</TooltipContent>
          </Tooltip>
        )}

        {story.labels.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="bg-muted text-muted-foreground rounded-sm flex-shrink-0 truncate"
                style={{
                  paddingLeft: 4, paddingRight: 4, paddingTop: 1, paddingBottom: 1,
                  fontSize: '0.55rem',
                  maxWidth: 70,
                }}
              >
                {story.labels.length === 1 ? story.labels[0] : `${story.labels.length} tags`}
              </span>
            </TooltipTrigger>
            <TooltipContent>{story.labels.join(', ')}</TooltipContent>
          </Tooltip>
        )}

        {story.origin === 'ai_suggested' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="font-bold flex-shrink-0"
                style={{ paddingLeft: 4, paddingRight: 4, fontSize: '0.55rem', color: 'hsl(var(--accent-warm))' }}
              >
                AI
              </span>
            </TooltipTrigger>
            <TooltipContent>Auto-detected cluster</TooltipContent>
          </Tooltip>
        )}

        {showPhaseChip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid="story-phase-chip"
                data-phase={phase}
                className="font-bold flex-shrink-0 whitespace-nowrap rounded-sm"
                style={{
                  paddingLeft: 4, paddingRight: 4, paddingTop: 1, paddingBottom: 1,
                  fontSize: '0.55rem',
                  color: PHASE_COLORS[phase],
                  backgroundColor: `color-mix(in srgb, ${PHASE_COLORS[phase]} 14%, transparent)`,
                  border: `1px solid ${PHASE_COLORS[phase]}`,
                }}
              >
                {PHASE_LABELS[phase]}
              </span>
            </TooltipTrigger>
            <TooltipContent>{`Phase: ${PHASE_LABELS[phase]}`}</TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        {assignee && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar style={{ width: 16, height: 16 }}>
                <AvatarImage src={assignee.avatar_url || undefined} />
                <AvatarFallback style={{ fontSize: '0.55rem' }}>
                  {(assignee.display_name || '?').slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{`Assigned to ${assignee.display_name ?? 'admin'}`}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
