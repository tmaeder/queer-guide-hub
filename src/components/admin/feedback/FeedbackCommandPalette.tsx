import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { kanbanColumns, priorities, type KanbanStatus } from './constants';
import type { AdminProfile } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  admins: AdminProfile[];
  onJumpToColumn: (status: KanbanStatus) => void;
  onSetPriority: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onForwardSelected: () => void;
  onFocusSearch: () => void;
  onOpenHelp: () => void;
}

export function FeedbackCommandPalette({
  open,
  onOpenChange,
  selectedCount,
  admins,
  onJumpToColumn,
  onSetPriority,
  onAssign,
  onForwardSelected,
  onFocusSearch,
  onOpenHelp,
}: Props) {
  const run = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command… (columns, priority, assign, forward)" />
      <CommandList>
        <CommandEmpty>No commands.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {kanbanColumns.map((c) => (
            <CommandItem key={c.id} onSelect={() => run(() => onJumpToColumn(c.id))}>
              Jump to column — {c.label}
            </CommandItem>
          ))}
          <CommandItem onSelect={() => run(onFocusSearch)}>Focus search</CommandItem>
          <CommandItem onSelect={() => run(onOpenHelp)}>Keyboard shortcuts…</CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={`Actions on ${selectedCount} selected`}>
          {priorities.map((p) => (
            <CommandItem
              key={p.value}
              disabled={selectedCount === 0}
              onSelect={() => run(() => onSetPriority(p.value))}
            >
              Set priority — {p.short} {p.label}
            </CommandItem>
          ))}
          <CommandItem
            disabled={selectedCount === 0}
            onSelect={() => run(() => onAssign(null))}
          >
            Unassign
          </CommandItem>
          {admins.map((a) => (
            <CommandItem
              key={a.user_id}
              disabled={selectedCount === 0}
              onSelect={() => run(() => onAssign(a.user_id))}
            >
              Assign to — {a.display_name || a.user_id.slice(0, 8)}
            </CommandItem>
          ))}
          <CommandItem disabled={selectedCount === 0} onSelect={() => run(onForwardSelected)}>
            Forward selected to GitHub
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
