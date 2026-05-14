import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, priorityFor } from './constants';
import type { AdminProfile, FeedbackAuditEntry } from './types';

interface Props {
  entries: FeedbackAuditEntry[];
  adminById: Record<string, AdminProfile>;
}

function jsonStr(v: unknown, map?: Record<string, AdminProfile>): string {
  if (v == null) return '—';
  if (typeof v === 'string') {
    if (map && map[v]?.display_name) return map[v].display_name!;
    return v;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return JSON.stringify(v);
}

function renderChange(
  entry: FeedbackAuditEntry,
  adminById: Record<string, AdminProfile>,
): string {
  const fromVal = entry.old_value;
  const toVal = entry.new_value;
  switch (entry.field) {
    case 'feedback_status': {
      const from = kanbanColumns.find((c) => c.id === fromVal)?.label ?? jsonStr(fromVal);
      const to = kanbanColumns.find((c) => c.id === toVal)?.label ?? jsonStr(toVal);
      return `Status: ${from} → ${to}`;
    }
    case 'priority':
      return `Priority: ${priorityFor(Number(fromVal ?? 2)).short} → ${priorityFor(Number(toVal ?? 2)).short}`;
    case 'assignee_id':
      return `Assignee: ${jsonStr(fromVal, adminById)} → ${jsonStr(toVal, adminById)}`;
    case 'labels':
      return `Labels: ${jsonStr(fromVal)} → ${jsonStr(toVal)}`;
    case 'resolution':
      return `Resolution: ${jsonStr(fromVal)} → ${jsonStr(toVal)}`;
    case 'is_spam':
      return toVal ? 'Marked as spam' : 'Restored from spam';
    case 'duplicate_of':
      return toVal ? `Merged as duplicate of ${String(toVal).slice(0, 8)}` : 'Unmerged';
    case 'forwarded':
      return `Forwarded to GitHub issue #${jsonStr(toVal)}`;
    default:
      return `${entry.field}: ${jsonStr(fromVal)} → ${jsonStr(toVal)}`;
  }
}

export function ActivityLog({ entries, adminById }: Props) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => entries, [entries]);
  if (grouped.length === 0) return null;

  return (
    <div className="mb-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 cursor-pointer py-1"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <History size={12} />
          <span className="text-xs font-semibold">
            Activity ({grouped.length})
          </span>
        </button>
        <CollapsibleContent>
          <div className="mt-1 p-2 bg-muted rounded max-h-[220px] overflow-y-auto">
            {grouped.map((e) => (
              <div key={e.id} className="mb-1">
                <p className="block text-[0.7rem]">
                  <strong>
                    {e.actor_id ? adminById[e.actor_id]?.display_name ?? 'Admin' : 'System'}
                  </strong>{' '}
                  {renderChange(e, adminById)}
                </p>
                <p className="text-[0.6rem] text-muted-foreground">
                  {timeAgo(e.at)}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
