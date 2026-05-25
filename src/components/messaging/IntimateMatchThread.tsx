import { useState } from 'react';
import { ShieldOff, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useEndIntimateThread,
  useIntimateThreadConsent,
  useOpeningMoves,
} from '@/hooks/useIntimateThread';
import { cn } from '@/lib/utils';

interface IntimateMatchThreadProps {
  conversationId: string;
  /** Whether the participant has sent any messages yet. Drives opening-move ribbon. */
  hasMessages: boolean;
  /** Insert a prompt into the composer when picked. */
  onPickOpeningMove?: (prompt: string) => void;
  className?: string;
}

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * Header ribbon for conversation_type='match' threads. Shows the consent
 * timeline (matched on / photo unlock / location share / ended), surfaces
 * curated opening-move prompts before the first message, and offers an
 * "End conversation" affordance.
 *
 * Per plan: photo unlock + location share full UX is a Phase 6 follow-up;
 * this commit ships the timeline + ended-state + opening moves.
 */
export function IntimateMatchThread({
  conversationId,
  hasMessages,
  onPickOpeningMove,
  className,
}: IntimateMatchThreadProps) {
  const { data: consent } = useIntimateThreadConsent(conversationId);
  const { data: moves = [] } = useOpeningMoves();
  const endMutation = useEndIntimateThread(conversationId);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!consent) return null;

  const matchedOn = fmt(consent.matched_at);
  const ended = consent.ended_at !== null;

  if (ended) {
    return (
      <div
        className={cn(
          'rounded-element border border-border bg-muted/30 p-3 text-13 text-muted-foreground',
          className,
        )}
        role="status"
      >
        Conversation ended {fmt(consent.ended_at)}.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3 rounded-element border border-border bg-card p-3 text-13">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span>Matched{matchedOn ? ` ${matchedOn}` : ''}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmEnd(true)}
          className="rounded-element text-muted-foreground"
        >
          <ShieldOff className="h-4 w-4 mr-1" aria-hidden />
          End conversation
        </Button>
      </div>

      {!hasMessages && moves.length > 0 && (
        <div className="rounded-element border border-dashed border-border p-3">
          <p className="mb-2 text-13 text-muted-foreground">
            Pick a prompt to break the ice — you can edit it before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            {moves.map((m) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => onPickOpeningMove?.(m.prompt)}
                className="rounded-badge border border-border px-3 py-1 text-13 text-foreground hover:bg-muted/40 transition-colors"
                title={m.tone}
              >
                {m.prompt.length > 60 ? `${m.prompt.slice(0, 57)}…` : m.prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End conversation?</DialogTitle>
            <DialogDescription>
              Both of you will lose access to this thread. No notification is sent.
              You can still block the other person separately if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmEnd(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                await endMutation.mutateAsync();
                setConfirmEnd(false);
              }}
              disabled={endMutation.isPending}
            >
              End conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
