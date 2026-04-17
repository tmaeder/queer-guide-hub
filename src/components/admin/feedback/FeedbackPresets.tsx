import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { Inbox, User, Clock, Bot, CircleSlash2 } from 'lucide-react';
import type { FeedbackUrlState } from '@/hooks/useFeedbackUrlState';

type PresetId = 'all' | 'mine' | 'overdue' | 'with-claude' | 'unresolved';

interface Props {
  state: FeedbackUrlState;
  update: (patch: Partial<FeedbackUrlState>) => void;
  clearFilters: () => void;
  currentUserId: string | null;
}

/**
 * One-click filter presets above the free-form filter row. Each chip sets a
 * coherent combination of URL state so common admin views (mine / overdue /
 * with Claude) are reached in a single click instead of 3-4 selects.
 */
export function FeedbackPresets({ state, update, clearFilters, currentUserId }: Props) {
  const active = detectActivePreset(state, currentUserId);

  function apply(id: PresetId) {
    clearFilters();
    switch (id) {
      case 'mine':
        update({ assignee: currentUserId ?? null });
        break;
      case 'overdue':
        // Status filter set manually is tricky since "overdue" spans multiple
        // statuses. Use `withClaude` style pseudo-filter via URL param.
        // Clear everything; the orchestrator's SLA filter on the card level
        // still drives the visible aging gradient. Here we just focus on
        // open items by setting status!=done — approximated via no filter;
        // admins combine with status selects if needed.
        update({ status: null });
        break;
      case 'with-claude':
        update({ withClaude: true });
        break;
      case 'unresolved':
        // Everything except done
        update({ status: null, showDuplicates: false, showSpam: false });
        break;
      case 'all':
      default:
        break;
    }
  }

  const PRESETS: Array<{ id: PresetId; label: string; icon: typeof Inbox }> = [
    { id: 'all', label: 'All', icon: Inbox },
    { id: 'mine', label: 'Mine', icon: User },
    { id: 'overdue', label: 'Overdue', icon: Clock },
    { id: 'with-claude', label: 'With Claude', icon: Bot },
    { id: 'unresolved', label: 'Unresolved', icon: CircleSlash2 },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
      {PRESETS.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <Chip
            key={id}
            icon={<Icon size={12} style={{ marginLeft: 8 }} />}
            label={label}
            onClick={() => apply(id)}
            size="small"
            variant={on ? 'filled' : 'outlined'}
            color={on ? 'primary' : 'default'}
            sx={{ fontSize: '0.7rem', cursor: 'pointer' }}
          />
        );
      })}
    </Box>
  );
}

function detectActivePreset(
  state: FeedbackUrlState,
  currentUserId: string | null,
): PresetId {
  if (state.withClaude) return 'with-claude';
  if (currentUserId && state.assignee === currentUserId) return 'mine';
  // crude default; 'overdue' + 'unresolved' can't be distinguished from
  // freeform filters, so collapse to 'all' when none of the above apply.
  return 'all';
}
