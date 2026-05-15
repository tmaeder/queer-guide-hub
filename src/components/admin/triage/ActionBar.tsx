import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, SkipForward, Flag } from 'lucide-react';
import { CannedResponsePicker } from './CannedResponsePicker';

interface ActionBarProps {
  onAction: (action: 'approve' | 'reject' | 'skip' | 'flag', notes?: string, cannedSlug?: string) => void;
  isLoading: boolean;
}

export function ActionBar({ onAction, isLoading }: ActionBarProps) {
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
    <div className="border-t p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => handleAction('approve')}
          disabled={isLoading}
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
          disabled={isLoading}
          className="h-7 text-xs border-l-2 border-l-foreground bg-background text-foreground hover:bg-foreground hover:text-background rounded-element"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction('skip')}
          disabled={isLoading}
          className="h-7 text-xs"
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction('flag')}
          disabled={isLoading}
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
