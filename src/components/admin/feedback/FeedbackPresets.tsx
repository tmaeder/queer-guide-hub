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
        update({ status: null });
        break;
      case 'with-claude':
        update({ withClaude: true });
        break;
      case 'unresolved':
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
    <div className="flex gap-1.5 flex-wrap">
      {PRESETS.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => apply(id)}
            className={`inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded-full cursor-pointer border transition ${
              on
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted/40'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function detectActivePreset(
  state: FeedbackUrlState,
  currentUserId: string | null,
): PresetId {
  if (state.withClaude) return 'with-claude';
  if (currentUserId && state.assignee === currentUserId) return 'mine';
  return 'all';
}
