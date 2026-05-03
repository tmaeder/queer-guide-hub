import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StorySuggestion } from './types';

interface Props {
  suggestions: StorySuggestion[];
  onAccept: (suggestionId: string, overrideTitle?: string) => void;
  onDismiss: (suggestionId: string) => void;
}

export function StorySuggestionsPanel({ suggestions, onAccept, onDismiss }: Props) {
  const [editing, setEditing] = useState<StorySuggestion | null>(null);
  const [editedTitle, setEditedTitle] = useState('');

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex flex-row items-center gap-2 mb-2">
        <Sparkles size={14} />
        <p className="text-sm font-semibold">
          AI-suggested stories ({suggestions.length})
        </p>
        <span className="text-xs text-muted-foreground">
          Clusters of ≥ 3 related items. Accept to create a story.
        </span>
      </div>
      <div className="flex flex-row gap-2 overflow-x-auto pb-2">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="min-w-[260px] p-3 border border-border rounded bg-background flex flex-col gap-1.5"
          >
            <p className="text-sm font-semibold leading-tight">
              {s.proposed_title}
            </p>
            <div className="flex flex-row items-center gap-2">
              <Badge variant="secondary" className="h-[18px] text-[0.65rem]">
                {s.member_ids.length} items
              </Badge>
              <Badge variant="secondary" className="h-[18px] text-[0.65rem]">
                {Math.round(s.avg_similarity * 100)}% match
              </Badge>
              <Badge variant="secondary" className="h-[18px] text-[0.65rem]">
                {s.method}
              </Badge>
            </div>
            <div className="flex flex-row gap-1 mt-1">
              <Button
                size="sm"
                onClick={() => onAccept(s.id)}
                className="flex-1 normal-case"
              >
                <Check size={12} className="mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(s);
                  setEditedTitle(s.proposed_title);
                }}
                className="normal-case"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s.id)}
                className="min-w-0 px-2"
                aria-label="Dismiss"
              >
                <X size={12} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Edit story title</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editedTitle.trim()}
              onClick={() => {
                if (editing) onAccept(editing.id, editedTitle.trim());
                setEditing(null);
              }}
            >
              Accept with title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
