import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, SkipForward, Flag } from 'lucide-react';
import { CannedResponsePicker } from './CannedResponsePicker';
import type { TriageAction, TriageAnswers } from './resolveDecision';

interface ActionBarProps {
  /**
   * CONTROLLED. These used to be local `useState`, and this component is rendered
   * with no `key`, so a typed note survived the queue advancing and attached itself
   * to the NEXT item. Worse, the keyboard path never reached this state at all, so
   * pressing `r` sent the rejection with no note and left the text in the box.
   * Owned by `TriageView` now, keyed by item id.
   */
  notes: string;
  cannedSlug: string;
  onAnswersChange: (patch: Partial<TriageAnswers>) => void;
  onAction: (action: TriageAction) => void;
  isLoading: boolean;
  /**
   * Actions to render but refuse. Used by dedup-review's namesake gate: approve is
   * withheld until the reviewer confirms, while reject and skip stay live — the
   * whole point of the flag is that "these are two different people" should be the
   * easy answer, and disabling the entire bar would make it the hardest.
   */
  disabledActions?: ReadonlyArray<TriageAction>;
}

export function ActionBar({
  notes,
  cannedSlug,
  onAnswersChange,
  onAction,
  isLoading,
  disabledActions = [],
}: ActionBarProps) {
  const blocked = (a: TriageAction) => disabledActions.includes(a);

  function handleCannedSelect(slug: string, template: string) {
    onAnswersChange({ cannedSlug: slug, notes: template });
  }

  // No local clear on act: the answers are keyed by item id upstream, so advancing
  // the queue leaves this item's note on this item, which is what a reviewer who
  // hits Undo expects to find.
  function handleAction(action: TriageAction) {
    onAction(action);
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
            // Editing clears the slug: the note is no longer the template, so
            // recording which template was used would misattribute it.
            onAnswersChange({ notes: e.target.value, cannedSlug: '' });
          }}
          placeholder="Review notes..."
          className="text-xs min-h-[60px] resize-none"
        />
      </div>
    </div>
  );
}
