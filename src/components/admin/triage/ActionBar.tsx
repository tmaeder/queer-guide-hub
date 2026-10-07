import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, SkipForward } from 'lucide-react';
import { CannedResponsePicker } from './CannedResponsePicker';
import type { TriageDecisionGuidance } from './triageDecisionGuidance';
import type { TriageAction, TriageAnswers } from './resolveDecision';

interface ActionBarProps {
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
  guidance?: TriageDecisionGuidance;
}

export function ActionBar({
  notes,
  cannedSlug,
  onAnswersChange,
  onAction,
  isLoading,
  disabledActions = [],
  guidance,
}: ActionBarProps) {
  const blocked = (a: TriageAction) => disabledActions.includes(a);

  function handleCannedSelect(slug: string, template: string) {
    onAnswersChange({ cannedSlug: slug, notes: template });
  }

  function handleAction(action: TriageAction) {
    onAction(action);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-2 shadow-soft">
      {guidance && (
        <section aria-labelledby="decision-outcome-heading" className="w-full pb-2">
          <div className="flex flex-col gap-2 rounded-element bg-muted/40 px-4 py-2 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
            <h3 id="decision-outcome-heading" className="text-2xs font-semibold">
              What happens next
            </h3>
            <p className="text-2xs leading-relaxed">
              <span className="font-semibold">If you approve:</span> {guidance.approve}
            </p>
            <p className="text-2xs leading-relaxed">
              <span className="font-semibold">If you don&rsquo;t:</span> {guidance.reject}{' '}
              {guidance.defer}
            </p>
          </div>
          {guidance.unsavedWarning && (
            <p role="alert" className="mt-2 text-2xs font-medium text-destructive">
              {guidance.unsavedWarning}
            </p>
          )}
        </section>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          data-triage-action="approve"
          onClick={() => handleAction('approve')}
          disabled={isLoading || blocked('approve')}
          className="h-9 min-h-9 text-xs"
        >
          <Check className="mr-1 size-3.5" />
          {guidance?.approveLabel ?? 'Approve'}
        </Button>
        {/* Destructive visual treatment (inline — no modal confirm, keyboard 'r' shortcut). */}
        <Button
          size="sm"
          data-triage-action="reject"
          variant="outline"
          onClick={() => handleAction('reject')}
          disabled={isLoading || blocked('reject')}
          className="h-9 min-h-9 rounded-element bg-card text-xs text-foreground shadow-soft hover:bg-foreground hover:text-background"
        >
          <X className="mr-1 size-3.5" />
          {guidance?.rejectLabel ?? 'Reject'}
        </Button>
        <Button
          size="sm"
          data-triage-action="skip"
          variant="outline"
          onClick={() => handleAction('skip')}
          disabled={isLoading || blocked('skip')}
          className="h-9 min-h-9 text-xs"
        >
          <SkipForward className="mr-1 size-3.5" />
          Skip
        </Button>
        {/* No Flag button. `triage_action` accepted 'flag' in its allowed-action
          list and implemented it in none of its 17 queue branches, so it fell
          through to that function's unconditional success object: the button
          wrote nothing, anywhere, and the inbox toasted success and advanced.
          No backing table has a column for a flag, so a handler is a feature
          rather than a fix. 99991791361273 makes the RPC refuse the string. */}
      </div>

      <div className="flex min-w-64 flex-1 items-center gap-2">
        <div className="w-40 shrink-0">
          <CannedResponsePicker value={cannedSlug} onSelect={handleCannedSelect} />
        </div>
        <Textarea
          value={notes}
          onChange={(e) => {
            onAnswersChange({ notes: e.target.value, cannedSlug: '' });
          }}
          placeholder="Review notes (optional)"
          aria-label="Review notes"
          className="h-9 min-h-9 resize-none py-2 text-xs focus:h-20"
        />
      </div>
    </div>
  );
}
