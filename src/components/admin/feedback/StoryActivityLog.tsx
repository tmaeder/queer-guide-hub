import { useState } from 'react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import { useStoryEvents } from '@/hooks/useStoryRoutine';
import type { FeedbackStoryEvent, StoryEventKind } from './types';

interface Props {
  storyId: string;
  adminById: Record<string, { user_id: string; display_name: string | null }>;
}

const KIND_LABEL: Record<StoryEventKind, string> = {
  status_changed: 'Status changed',
  approved_for_claude: 'Approved for Claude routine',
  needs_followup: 'Marked as needing more context',
  routine_dispatched: 'Routine dispatched',
  routine_progress: 'Routine progress',
  fix_proposed: 'Fix proposed',
  routine_failed: 'Routine failed',
  routine_cancelled: 'Routine cancelled',
  retest_started: 'Retest started',
  retest_finished: 'Retest finished',
  verified: 'Verified',
  reopened: 'Reopened',
  archived: 'Archived',
  unarchived: 'Unarchived',
  note: 'Note',
  legacy_handoff: 'Handoff (legacy)',
};

function renderEvent(e: FeedbackStoryEvent): string {
  const p = e.payload ?? {};
  switch (e.kind) {
    case 'routine_dispatched':
      return `Routine dispatched (${p.runner ?? '?'})`;
    case 'routine_progress':
      return `Routine ${p.status ?? 'progress'}`;
    case 'fix_proposed': {
      const conf = p.confidence ? ` · ${p.confidence}` : '';
      const files = Array.isArray(p.files_changed) ? ` · ${p.files_changed.length} files` : '';
      return `Fix proposed${conf}${files}`;
    }
    case 'retest_started':
      return `Retest started (${p.kind ?? '?'})`;
    case 'retest_finished':
      return `Retest ${p.status ?? 'finished'} (${p.kind ?? '?'})`;
    case 'needs_followup':
      return `Needs more context: ${p.reason ?? ''}`;
    case 'archived':
      return `Archived${p.reason ? `: ${p.reason}` : ''}`;
    case 'verified':
      return `Verified (${p.outcome ?? '?'})`;
    case 'legacy_handoff':
      return `Legacy handoff (${p.target ?? '?'} · ${p.status ?? '?'})`;
    default:
      return KIND_LABEL[e.kind] ?? e.kind;
  }
}

export function StoryActivityLog({ storyId, adminById }: Props) {
  const [open, setOpen] = useState(false);
  const { data: events = [] } = useStoryEvents(storyId);

  if (events.length === 0) return null;

  return (
    <div className="mb-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 cursor-pointer py-1"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <History size={12} />
          <span className="text-xs font-semibold">
            Story timeline ({events.length})
          </span>
        </button>
        <CollapsibleContent>
          <div
            className="mt-1 p-2 bg-muted rounded max-h-[280px] overflow-y-auto"
            data-testid="story-timeline"
          >
            {events.map((e) => (
              <div key={e.id} className="mb-1">
                <p className="block text-[0.7rem]">
                  <strong>
                    {e.actor_id
                      ? adminById[e.actor_id]?.display_name ?? 'Admin'
                      : e.actor_kind === 'runner'
                        ? 'Runner'
                        : 'System'}
                  </strong>{' '}
                  {renderEvent(e)}
                </p>
                <p className="text-[0.6rem] text-muted-foreground">
                  {timeAgo(e.created_at)}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
