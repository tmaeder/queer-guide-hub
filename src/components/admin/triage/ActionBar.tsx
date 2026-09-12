import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, SkipForward, Flag } from 'lucide-react';
import { CannedResponsePicker } from './CannedResponsePicker';

interface ActionBarProps {
  onAction: (
    action: 'approve' | 'reject' | 'skip' | 'flag',
    notes?: string,
    cannedSlug?: string,
  ) => void;
  isLoading: boolean;
  /**
   * Actions to render but refuse. Used by dedup-review's namesake gate: approve is
   * withheld until the reviewer confirms, while reject and skip stay live — the
   * whole point of the flag is that "these are two different people" should be the
   * easy answer, and disabling the entire bar would make it the hardest.
   */
  disabledActions?: ReadonlyArray<'approve' | 'reject' | 'skip' | 'flag'>;
}

export function ActionBar({ onAction, isLoading, disabledActions = [] }: ActionBarProps) {
  const blocked = (a: 'approve' | 'reject' | 'skip' | 'flag') => disabledActions.includes(a);
  const [notes, setNotes] = useState('');
  const [cannedSlug, setCannedSlug] = useState('');

  function handleCannedSelect(slug: string, template: string) {
    setCannedSlug(slug);
    setNotes(template);
  }

  function handleAction(action: 'approve' | 'reject' | 'skip' | 'flag') {
    onAction(action, notes || undefined, cannedSlug || undefined);
    setNotes('');
    setCannedSlug('');
  }

  return (
    <div className="border-t p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => handleAction('approve')}
          disabled={isLoading || blocked('approve')}
          className="h-7 text-xs"
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          Approve
        </Button>
        {/* Destructive visual treatment (inline — no modal confirm, keyboard 'r' shortcut). */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction('reject')}
          disabled={isLoading || blocked('reject')}
          className="h-7 text-xs bg-card text-foreground hover:bg-foreground hover:text-background rounded-element shadow-soft"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction('skip')}
          disabled={isLoading || blocked('skip')}
          className="h-7 text-xs"
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction('flag')}
          disabled={isLoading || blocked('flag')}
          className="h-7 text-xs"
        >
          <Flag className="h-3.5 w-3.5 mr-1" />
          Flag
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <div className="w-48 shrink-0">
          <CannedResponsePicker value={cannedSlug} onSelect={handleCannedSelect} />
        </div>
        <Textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setCannedSlug('');
          }}
          placeholder="Review notes..."
          className="text-xs min-h-[60px] resize-none"
        />
      </div>
    </div>
  );
}
