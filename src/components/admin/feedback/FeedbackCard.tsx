import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, AlertTriangle, Layers } from 'lucide-react';
import { Github } from '@/components/icons/brand';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';
import { priorityFor } from './constants';
import { latestHandoff } from '@/hooks/useFeedbackHandoff';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AdminProfile, FeedbackSubmission, SubmissionStoryRef } from './types';

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
  story?: SubmissionStoryRef | null;
  onStoryClick?: (storyId: string) => void;
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
  voteCount: _voteCount,
  selected,
  focused,
  watchers: _watchers,
  assignee,
  story,
  onStoryClick,
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
  const _hasScreenshot = !!item.data.screenshot_url;
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

  const cardStyle: React.CSSProperties = {
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: stripeWidth ? 8 : 7,
    paddingRight: 6,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        onClick={onClick}
        style={cardStyle}
        className={cn(
          'group relative rounded border cursor-pointer transition-all',
          focused
            ? 'border-primary shadow-md'
            : selected
              ? 'border-primary/50'
              : 'border-border',
          selected ? 'bg-muted' : 'bg-background',
          'hover:border-primary',
        )}
      >
        {stripeWidth > 0 && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: stripeWidth,
              background: prio.color,
              borderTopLeftRadius: 'inherit',
              borderBottomLeftRadius: 'inherit',
            }}
          />
        )}
        {isNew && (
          <span
            aria-hidden
            className="absolute top-1 right-1 rounded-full"
            style={{
              width: 7,
              height: 7,
              background: 'hsl(var(--foreground))',
              animation: 'feedback-pulse 1.8s infinite',
            }}
          />
        )}
        {isNew && (
          <style>{`@keyframes feedback-pulse {
            0% { box-shadow: 0 0 0 0 hsl(var(--foreground) / 0.6); }
            70% { box-shadow: 0 0 0 6px hsl(var(--foreground) / 0); }
            100% { box-shadow: 0 0 0 0 hsl(var(--foreground) / 0); }
          }`}</style>
        )}

        {/* Title row — category icon inline, urgent P0/P1 tag, hover checkbox */}
        <div className="flex items-start gap-1.5 mb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <CatIcon
                style={{
                  width: 12,
                  height: 12,
                  color: cat.color,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>{cat.label}</TooltipContent>
          </Tooltip>

          <p
            className="flex-1 font-semibold min-w-0 break-words overflow-hidden"
            style={{
              fontSize: '0.78rem',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {isUrgent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    style={{
                      display: 'inline-block',
                      marginRight: 4,
                      paddingLeft: 3,
                      paddingRight: 3,
                      borderRadius: 3,
                      background: prio.color,
                      color: '#fff',
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      verticalAlign: '2px',
                    }}
                  >
                    {prio.short}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{prio.label}</TooltipContent>
              </Tooltip>
            )}
            {item.data.title}
          </p>

          <div
            onClick={onToggleSelect}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'flex-shrink-0 transition-opacity',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            style={{ marginTop: 1 }}
          >
            <Checkbox
              checked={selected}
              className="h-3.5 w-3.5"
            />
          </div>
        </div>

        {/* Footer row 1 — time/SLA + assignee */}
        <div
          className="flex items-center gap-1.5 text-muted-foreground"
          style={{ fontSize: '0.65rem' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex items-center flex-shrink-0"
                style={{
                  color: slaColor ?? 'inherit',
                  fontWeight: slaColor ? 700 : 400,
                  gap: 2,
                }}
              >
                {slaColor && <Clock style={{ width: 10, height: 10 }} />}
                {timeAgo(item.submitted_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {slaColor
                ? `Open ${Math.floor(ageDays)}d — auto-escalates nightly`
                : `Submitted ${timeAgo(item.submitted_at)}`}
            </TooltipContent>
          </Tooltip>

          {handoffChip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: handoffChip.bg,
                    flexShrink: 0,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {handoff
                  ? `${handoffChip.label} — ${handoff.target} ${timeAgo(handoff.at)}`
                  : ''}
              </TooltipContent>
            </Tooltip>
          ) : (
            isForwarded && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Github style={{ width: 10, height: 10, color: '#6366f1', flexShrink: 0 }} />
                </TooltipTrigger>
                <TooltipContent>
                  {`GitHub #${item.github_issue_number}${withClaude ? ' (open)' : ''}`}
                </TooltipContent>
              </Tooltip>
            )
          )}

          {hasScreenshot && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Camera style={{ width: 10, height: 10, flexShrink: 0 }} />
              </TooltipTrigger>
              <TooltipContent>Screenshot attached</TooltipContent>
            </Tooltip>
          )}

          {errorCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center flex-shrink-0"
                  style={{ gap: 1, color: '#ef4444' }}
                >
                  <AlertTriangle style={{ width: 10, height: 10 }} />
                  {errorCount}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {`${errorCount} console error${errorCount === 1 ? '' : 's'}`}
              </TooltipContent>
            </Tooltip>
          )}

          {story && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onStoryClick?.(story.story_id);
                  }}
                  className="inline-flex items-center flex-shrink-0 overflow-hidden whitespace-nowrap"
                  style={{
                    gap: 2,
                    paddingLeft: 4,
                    paddingRight: 4,
                    paddingTop: 1,
                    paddingBottom: 1,
                    fontSize: '0.55rem',
                    background:
                      story.status === 'resolved'
                        ? 'hsl(var(--muted))'
                        : 'hsl(var(--foreground) / 0.15)',
                    color:
                      story.status === 'resolved'
                        ? 'hsl(var(--muted-foreground))'
                        : 'hsl(var(--foreground))',
                    borderRadius: 4,
                    maxWidth: 90,
                    textOverflow: 'ellipsis',
                    cursor: onStoryClick ? 'pointer' : 'default',
                  }}
                >
                  <Layers style={{ width: 9, height: 9 }} />
                  {story.title}
                </span>
              </TooltipTrigger>
              <TooltipContent>{`Part of story: ${story.title}`}</TooltipContent>
            </Tooltip>
          )}

          {(item.labels?.length ?? 0) > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="bg-muted text-muted-foreground flex-shrink-0 overflow-hidden whitespace-nowrap"
                  style={{
                    paddingLeft: 4,
                    paddingRight: 4,
                    paddingTop: 1,
                    paddingBottom: 1,
                    fontSize: '0.55rem',
                    borderRadius: 4,
                    maxWidth: 60,
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.labels!.length === 1 ? item.labels![0] : `${item.labels!.length}`}
                </span>
              </TooltipTrigger>
              <TooltipContent>{(item.labels ?? []).join(', ')}</TooltipContent>
            </Tooltip>
          )}

          {voteCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center flex-shrink-0"
                  style={{ gap: 1 }}
                >
                  <ChevronUp style={{ width: 10, height: 10 }} />
                  {voteCount}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {`${voteCount} vote${voteCount === 1 ? '' : 's'}`}
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex-1" />

          {assignee && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar style={{ width: 16, height: 16 }}>
                  {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                  <AvatarFallback style={{ fontSize: '0.55rem' }}>
                    {(assignee.display_name || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                {`Assigned to ${assignee.display_name || 'admin'}`}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Footer row 2 — story, handoff/github, errors (conditional) */}
        {(story || handoffChip || isForwarded || errorCount > 0) && (
          <div
            className="flex items-center gap-1.5 text-muted-foreground mt-1"
            style={{ fontSize: '0.65rem' }}
          >
            {story && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onStoryClick?.(story.story_id);
                    }}
                    className="inline-flex items-center flex-shrink-0 overflow-hidden whitespace-nowrap"
                    style={{
                      gap: 2,
                      paddingLeft: 4,
                      paddingRight: 4,
                      paddingTop: 1,
                      paddingBottom: 1,
                      fontSize: '0.55rem',
                      background:
                        story.status === 'resolved'
                          ? 'hsl(var(--muted))'
                          : 'hsl(var(--accent-warm) / 0.15)',
                      color:
                        story.status === 'resolved'
                          ? 'hsl(var(--muted-foreground))'
                          : 'hsl(var(--accent-warm))',
                      borderRadius: 4,
                      maxWidth: 90,
                      textOverflow: 'ellipsis',
                      cursor: onStoryClick ? 'pointer' : 'default',
                    }}
                  >
                    <Layers style={{ width: 9, height: 9 }} />
                    {story.title}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{`Part of story: ${story.title}`}</TooltipContent>
              </Tooltip>
            )}

            {handoffChip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: handoffChip.bg,
                      flexShrink: 0,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {handoff
                    ? `${handoffChip.label} — ${handoff.target} ${timeAgo(handoff.at)}`
                    : ''}
                </TooltipContent>
              </Tooltip>
            ) : (
              isForwarded && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Github style={{ width: 10, height: 10, color: '#6366f1', flexShrink: 0 }} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {`GitHub #${item.github_issue_number}${withClaude ? ' (open)' : ''}`}
                  </TooltipContent>
                </Tooltip>
              )
            )}

            {errorCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center flex-shrink-0"
                    style={{ gap: 1, color: '#ef4444' }}
                  >
                    <AlertTriangle style={{ width: 10, height: 10 }} />
                    {errorCount}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {`${errorCount} console error${errorCount === 1 ? '' : 's'}`}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
