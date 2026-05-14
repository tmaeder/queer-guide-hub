import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import type { CMSView } from './CMSSidebar';

export interface CommandPaletteAction {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  group?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: CMSView, contentType?: string) => void;
  onEdit: (contentType: string, itemId: string | null) => void;
  /** Optional context-specific actions (e.g. Save, Publish when editor is open). */
  contextActions?: CommandPaletteAction[];
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onEdit,
  contextActions = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const navActions: CommandPaletteAction[] = useMemo(
    () => [
      { id: 'nav.overview', label: 'Go to Overview', group: 'Navigate', perform: () => onNavigate('overview') },
      { id: 'nav.content', label: 'Go to Content', group: 'Navigate', perform: () => onNavigate('content') },
      { id: 'nav.review', label: 'Go to Review queue', group: 'Navigate', perform: () => onNavigate('review') },
      { id: 'nav.media', label: 'Go to Media library', group: 'Navigate', perform: () => onNavigate('media') },
      { id: 'nav.quality', label: 'Go to Data Quality', group: 'Navigate', perform: () => onNavigate('quality') },
      { id: 'nav.moderation', label: 'Go to Moderation queue', group: 'Navigate', perform: () => onNavigate('moderation') },
      { id: 'nav.audit', label: 'Go to Audit log', group: 'Navigate', perform: () => onNavigate('audit') },
      { id: 'nav.settings', label: 'Go to Settings', group: 'Navigate', perform: () => onNavigate('settings') },
    ],
    [onNavigate],
  );

  const newActions: CommandPaletteAction[] = useMemo(
    () =>
      Object.values(contentTypeRegistry).map((ct) => ({
        id: `new.${ct.id}`,
        label: `New ${ct.label.singular}`,
        hint: ct.label.plural,
        group: 'Create',
        perform: () => onEdit(ct.id, null),
      })),
    [onEdit],
  );

  const browseActions: CommandPaletteAction[] = useMemo(
    () =>
      Object.values(contentTypeRegistry).map((ct) => ({
        id: `browse.${ct.id}`,
        label: `Browse ${ct.label.plural}`,
        group: 'Content',
        perform: () => onNavigate('content', ct.id),
      })),
    [onNavigate],
  );

  const allGroups: { name: string; items: CommandPaletteAction[] }[] = [
    contextActions.length > 0 && { name: 'Actions', items: contextActions },
    { name: 'Navigate', items: navActions },
    { name: 'Create', items: newActions },
    { name: 'Content', items: browseActions },
  ].filter(Boolean) as { name: string; items: CommandPaletteAction[] }[];

  const run = (action: CommandPaletteAction) => {
    onOpenChange(false);
    action.perform();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search actions, content types…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {allGroups.map((g) => (
          <CommandGroup key={g.name} heading={g.name}>
            {g.items.map((a) => (
              <CommandItem key={a.id} value={`${a.label} ${a.hint ?? ''}`} onSelect={() => run(a)}>
                <span>{a.label}</span>
                {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
