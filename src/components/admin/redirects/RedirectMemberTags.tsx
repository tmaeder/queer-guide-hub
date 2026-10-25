import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { memberRedirectApi, type MemberResources } from '@/lib/redirects/memberApi';
import { Button } from '@/components/ui/button';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

export function RedirectMemberTags({
  tags,
  onChanged,
  onClose,
}: {
  tags: MemberResources['tags'];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('gray');
  const [deleting, setDeleting] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: ({ id, remove }: { id?: string; remove?: boolean }) =>
      memberRedirectApi(
        '/tags' + (id ? '/' + id : ''),
        remove ? 'DELETE' : id ? 'PATCH' : 'POST',
        remove ? undefined : { name: name.trim(), color },
      ),
    onSuccess: async () => {
      if (alive.current) {
        setEditing(null);
        setName('');
        setColor('gray');
        setDeleting(null);
      }
      await onChanged();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>
            Tags are shared across this workspace. Renaming or deleting a tag updates every link
            that uses it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate({ id: editing ?? undefined });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="member-tag-name">Tag name</Label>
            <Input
              id="member-tag-name"
              required
              maxLength={100}
              value={name}
              disabled={change.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="member-tag-color">Tag color</Label>
            <select
              id="member-tag-color"
              className="block w-full rounded-element border bg-background p-2"
              value={color}
              disabled={change.isPending}
              onChange={(event) => setColor(event.target.value)}
            >
              {COLORS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={change.isPending || !name.trim()}>
              {change.isPending ? 'Saving…' : editing ? 'Save tag' : 'Create tag'}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                disabled={change.isPending}
                onClick={() => {
                  setEditing(null);
                  setName('');
                  setColor('gray');
                  change.reset();
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
        {change.isError && (
          <p role="alert" className="text-destructive">
            {change.error.message}
          </p>
        )}
        {!tags.length && <AdminEmpty noun="tags" variant="inline" />}
        <ul className="divide-y">
          {tags.map((tag) => (
            <li key={tag.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {tag.name} <span className="text-sm text-muted-foreground">· {tag.color}</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={change.isPending}
                    aria-label={'Edit tag ' + tag.name}
                    onClick={() => {
                      setEditing(tag.id);
                      setName(tag.name);
                      setColor(tag.color);
                      setDeleting(null);
                      change.reset();
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={change.isPending}
                    aria-label={'Delete tag ' + tag.name}
                    onClick={() => {
                      setDeleting(tag.id);
                      change.reset();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {deleting === tag.id && (
                <div className="space-y-2">
                  <p className="text-sm">
                    Delete “{tag.name}” from this workspace and remove it from every link?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={change.isPending}
                      onClick={() => change.mutate({ id: tag.id, remove: true })}
                    >
                      Confirm delete tag
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={change.isPending}
                      onClick={() => setDeleting(null)}
                    >
                      Keep tag
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
