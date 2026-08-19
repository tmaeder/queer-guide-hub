import { useState } from 'react';
import { MoreHorizontal, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SavedView } from '@/hooks/useContentViews';

/**
 * The saved views for one content type, plus the unsaved-changes affordance.
 *
 * A hand-rolled tablist rather than Radix Tabs: Radix unmounts inactive
 * TabsContent, which would tear down and refetch the whole data surface on
 * every view switch.
 */

interface Props {
  views: SavedView[];
  activeId: string | null;
  dirty: boolean;
  onSelect: (view: SavedView) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onSave: () => void;
  onReset: () => void;
}

export function ViewBar({
  views,
  activeId,
  dirty,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSetDefault,
  onSave,
  onReset,
}: Props) {
  const [dialog, setDialog] = useState<{ mode: 'create' | 'rename'; id?: string } | null>(null);
  const [draftName, setDraftName] = useState('');

  const open = (mode: 'create' | 'rename', view?: SavedView) => {
    setDraftName(mode === 'rename' ? (view?.name ?? '') : '');
    setDialog({ mode, id: view?.id });
  };

  const submit = () => {
    const name = draftName.trim();
    if (!name || !dialog) return;
    if (dialog.mode === 'create') onCreate(name);
    else if (dialog.id) onRename(dialog.id, name);
    setDialog(null);
  };

  return (
    <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
      {views.length === 0 && (
        /* Outside the group: an empty-state sentence is not one of the views
           the group is labelled as holding. */
        <span className="text-sm text-muted-foreground px-2">No saved views yet.</span>
      )}
      {/* A GROUP of toggle buttons, not a tablist. There are no tabpanels here
        and no roving arrow-key focus: a saved view re-filters the list in
        place. Announcing "tab 3 of 5" promised a panel that does not exist and
        a keyboard model that was never implemented, and forced every per-view
        options menu to be an illegal tablist child (axe aria-required-children
        + aria-required-parent, reported as a pair — the pair is the tell that
        the ROLE is wrong, not that a stray control wandered in). `aria-pressed`
        states which view is applied. */}
      <div role="group" aria-label="Views" className="flex items-center gap-1 overflow-x-auto">
        {views.map((v) => {
          const isActive = v.id === activeId;
          return (
            <div key={v.id} className="group flex items-center shrink-0">
              <Button
                aria-pressed={isActive}
                // Unsaved state is announced, not only shown as a dot.
                aria-label={isActive && dirty ? `${v.name}, unsaved changes` : v.name}
                size="sm"
                variant={isActive ? 'secondary' : 'ghost'}
                className="h-8"
                onClick={() => onSelect(v)}
              >
                {v.name}
                {v.isDefault && <Star size={12} className="ml-1.5 opacity-60" />}
                {isActive && dirty && (
                  <span aria-hidden="true" className="ml-1.5">
                    •
                  </span>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`View options: ${v.name}`}
                  >
                    <MoreHorizontal size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => open('rename', v)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSetDefault(v.id)} disabled={v.isDefault}>
                    Set as default
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onDelete(v.id)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      {/* Outside the group: creating a view is an action on the set, not a
        member of it. */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        aria-label="New view"
        onClick={() => open('create')}
      >
        <Plus size={14} />
      </Button>

      {dirty && (
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
          {activeId && (
            <Button size="sm" variant="outline" className="h-8" onClick={onSave}>
              Save
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => open('create')}>
            Save as new
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={onReset}>
            Reset
          </Button>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'rename' ? 'Rename view' : 'New view'}</DialogTitle>
          </DialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="View name"
            aria-label="View name"
            maxLength={60}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!draftName.trim()}>
              {dialog?.mode === 'rename' ? 'Rename' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
