import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
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
    <Box sx={{ mb: 1 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.5 }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <History size={12} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Story timeline ({events.length})
        </Typography>
      </Box>
      <Collapse in={open}>
        <Box
          sx={{
            mt: 0.5,
            p: 1,
            bgcolor: 'action.hover',
            borderRadius: 1,
            maxHeight: 280,
            overflowY: 'auto',
          }}
          data-testid="story-timeline"
        >
          {events.map((e) => (
            <Box key={e.id} sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem' }}>
                <strong>
                  {e.actor_id
                    ? adminById[e.actor_id]?.display_name ?? 'Admin'
                    : e.actor_kind === 'runner'
                      ? 'Runner'
                      : 'System'}
                </strong>{' '}
                {renderEvent(e)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                {timeAgo(e.created_at)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
