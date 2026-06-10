import { useState } from 'react';
import { FolderPlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useCollectionItems,
  useCreateCollection,
  useGroupCollections,
  useRemoveCollectionItem,
  type GroupCollection,
} from '@/hooks/useGroupCollections';
import { cn } from '@/lib/utils';

interface GroupCollectionsProps {
  groupId: string;
  isMember: boolean;
  className?: string;
}

/**
 * Member-driven collections of saved venues / events / listings / trips
 * scoped to a group. Per Phase 7 follow-up. The "Add to collection" action
 * from entity cards lives in a separate component (CollectionPicker) and
 * pairs with useAddCollectionItem.
 */
export function GroupCollections({ groupId, isMember, className }: GroupCollectionsProps) {
  const { data: collections = [], isLoading } = useGroupCollections(groupId);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select the first collection on load so the panel isn't empty.
  const selected = activeId
    ? collections.find((c) => c.id === activeId) ?? collections[0] ?? null
    : collections[0] ?? null;

  if (isLoading) {
    return <div className={cn('h-40 rounded-container border border-border bg-card animate-pulse', className)} />;
  }

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label="Group collections">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Collections</h3>
        {isMember && <NewCollectionDialog groupId={groupId} />}
      </div>

      {collections.length === 0 ? (
        <div className="rounded-container border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No collections yet.
          {isMember && ' Create one to start saving venues, events, listings, and trips together.'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {collections.map((c) => {
              const active = c.id === selected?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      'w-full rounded-element border px-4 py-2 text-left text-sm whitespace-nowrap md:whitespace-normal',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-foreground hover:bg-muted/40',
                    )}
                  >
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && <CollectionItemsPanel collection={selected} isMember={isMember} />}
        </div>
      )}
    </section>
  );
}

function NewCollectionDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createMutation = useCreateCollection();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || createMutation.isPending) return;
    await createMutation.mutateAsync({ groupId, name, description: description || undefined });
    setName('');
    setDescription('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="rounded-element">
          <FolderPlus className="h-4 w-4 mr-1" aria-hidden />
          New collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              A shared bucket for venues, events, listings, and trips this group cares about.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="collection-name">Name</Label>
              <Input
                id="collection-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                maxLength={80}
                placeholder="Weekend favorites"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="collection-description">Description (optional)</Label>
              <Textarea
                id="collection-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 400))}
                maxLength={400}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CollectionItemsPanel({
  collection,
  isMember,
}: {
  collection: GroupCollection;
  isMember: boolean;
}) {
  const { data: items = [], isLoading } = useCollectionItems(collection.id);
  const removeMutation = useRemoveCollectionItem(collection.id);

  return (
    <div className="rounded-container border border-border bg-card p-4">
      <header className="mb-4">
        <h4 className="text-base font-semibold text-foreground">{collection.name}</h4>
        {collection.description && (
          <p className="mt-1 text-13 text-muted-foreground">{collection.description}</p>
        )}
      </header>

      {isLoading ? (
        <p className="text-13 text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          No items yet.
          {isMember && ' Use the "Add to group collection" action on any venue, event, listing or trip.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-element border border-border bg-background px-4 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground capitalize">
                  {it.item_type}
                </p>
                <p className="truncate text-13 text-muted-foreground tabular-nums">
                  {it.item_id}
                  {it.note && <span className="text-muted-foreground"> · {it.note}</span>}
                </p>
              </div>
              {isMember && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMutation.mutate(it.id)}
                  disabled={removeMutation.isPending}
                  aria-label="Remove"
                  className="rounded-element"
                >
                  <Plus className="h-4 w-4 rotate-45" aria-hidden />
                  <Trash2 className="sr-only" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
