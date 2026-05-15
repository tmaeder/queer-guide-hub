import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { CheckCheck, Tag, UserPlus, Zap, X, Layers } from 'lucide-react';
import { Github } from '@/components/icons/brand';
import { kanbanColumns, priorities, type KanbanStatus } from './constants';
import type { AdminProfile, StoryWithCounts } from './types';

interface Props {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onSetStatus: (status: KanbanStatus) => void;
  onSetPriority: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onAddLabel: (label: string) => void;
  onForward: () => void;
  onCreateStory?: (title: string) => void;
  onAddToStory?: (storyId: string) => void;
  /** Runs when the admin opens the Create-Story dialog — returns a seed
   *  title the model proposes for the current selection. Rejections and
   *  nulls just leave the input empty. */
  onAutoTitle?: () => Promise<string | null>;
  stories?: StoryWithCounts[];
  admins: AdminProfile[];
  loading?: boolean;
}

export function FeedbackBulkBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onSetStatus,
  onSetPriority,
  onAssign,
  onAddLabel,
  onForward,
  onCreateStory,
  onAddToStory,
  onAutoTitle,
  stories,
  admins,
  loading,
}: Props) {
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyTitleLoading, setStoryTitleLoading] = useState(false);
  const openStories = (stories ?? []).filter(
    (s) => s.status !== 'resolved' && s.status !== 'archived',
  );

  const openCreateStoryDialog = async () => {
    setStoryTitle('');
    setStoryOpen(true);
    if (!onAutoTitle) return;
    setStoryTitleLoading(true);
    try {
      const suggested = await onAutoTitle();
      // Only fill if the admin hasn't already typed something in the interim.
      setStoryTitle((prev) => (prev ? prev : suggested ?? ''));
    } catch {
      /* leave empty on failure */
    } finally {
      setStoryTitleLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div
        className="sticky bottom-4 mx-auto px-4 py-2 flex items-center gap-2 rounded-element z-50 flex-wrap max-w-[1200px] bg-background border border-border shadow-lg"
      >
        <Badge>{selectedCount} selected</Badge>
        {selectedCount < totalCount && (
          <Button size="sm" variant="ghost" onClick={onSelectAll}>
            <CheckCheck size={14} />
            Select all ({totalCount})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading}>
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {kanbanColumns.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onSetStatus(c.id)}>
                <span
                  className="w-2 h-2 rounded-full mr-2 inline-block"
                  style={{ background: c.color }}
                />
                {c.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading}>
              <Zap size={14} />
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {priorities.map((p) => (
              <DropdownMenuItem key={p.value} onClick={() => onSetPriority(p.value)}>
                <span
                  className="w-2 h-2 rounded-full mr-2 inline-block"
                  style={{ background: p.color }}
                />
                {p.short} · {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading}>
              <UserPlus size={14} />
              Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onAssign(null)}>
              <X size={14} className="mr-2" />
              Unassign
            </DropdownMenuItem>
            {admins.map((a) => (
              <DropdownMenuItem key={a.user_id} onClick={() => onAssign(a.user_id)}>
                {a.display_name || a.user_id.slice(0, 8)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setLabelOpen(true)}
          disabled={loading}
        >
          <Tag size={14} />
          Label
        </Button>

        {(onCreateStory || onAddToStory) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={loading}>
                <Layers size={14} />
                Story
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {onCreateStory && (
                <DropdownMenuItem onClick={() => void openCreateStoryDialog()}>
                  Create story from selection…
                </DropdownMenuItem>
              )}
              {onAddToStory && openStories.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Add to story…</DropdownMenuLabel>
                  {openStories.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => onAddToStory(s.id)}>
                      {s.title} ({s.member_count})
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {onAddToStory && openStories.length === 0 && (
                <DropdownMenuItem disabled>No open stories yet</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          size="sm"
          onClick={onForward}
          disabled={loading}
          style={{ background: 'hsl(var(--foreground))' }}
          className="text-white hover:opacity-90"
        >
          <Github size={14} />
          Forward
        </Button>
      </div>

      <Dialog open={storyOpen} onOpenChange={setStoryOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Create story from {selectedCount} selected</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder={
                storyTitleLoading ? 'Suggesting a title…' : 'Short title for this story'
              }
              value={storyTitle}
              onChange={(e) => setStoryTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && storyTitle.trim() && onCreateStory) {
                  onCreateStory(storyTitle.trim());
                  setStoryOpen(false);
                }
              }}
            />
            <Label className="text-xs text-muted-foreground font-normal">
              {storyTitleLoading
                ? 'Cloudflare Llama is summarising the selection'
                : 'Edit the auto-suggested title or write your own'}
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoryOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!storyTitle.trim()}
              onClick={() => {
                if (onCreateStory) onCreateStory(storyTitle.trim());
                setStoryOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              Add label to {selectedCount} item{selectedCount === 1 ? '' : 's'}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. regression, ux, a11y"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && labelInput.trim()) {
                onAddLabel(labelInput.trim());
                setLabelInput('');
                setLabelOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!labelInput.trim()}
              onClick={() => {
                onAddLabel(labelInput.trim());
                setLabelInput('');
                setLabelOpen(false);
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
