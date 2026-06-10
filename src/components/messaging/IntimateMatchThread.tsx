import { useState } from 'react';
import { Image as ImageIcon, MapPin, ShieldOff, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  useMyConsentSide,
  useOpeningMoves,
  useSetPhotoUnlock,
  useShareLocation,
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

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return null;
  }
}

const LOCATION_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
];

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
  const { data: side } = useMyConsentSide(conversationId);
  const { data: moves = [] } = useOpeningMoves();
  const endMutation = useEndIntimateThread(conversationId);
  const photoMutation = useSetPhotoUnlock(conversationId);
  const locationMutation = useShareLocation(conversationId);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!consent) return null;

  const matchedOn = fmt(consent.matched_at);
  const ended = consent.ended_at !== null;
  const myUnlocked =
    side === 'a' ? consent.photo_unlocked_a : side === 'b' ? consent.photo_unlocked_b : false;
  const theirUnlocked =
    side === 'a' ? consent.photo_unlocked_b : side === 'b' ? consent.photo_unlocked_a : false;
  const photosUnlockedBoth = consent.photo_unlocked_a && consent.photo_unlocked_b;
   
  const locationActive =
    // eslint-disable-next-line react-hooks/purity -- time-relative value (Date.now / Math.random) used to compute a label or filter cutoff; sub-second precision irrelevant for this UI.
    consent.location_expires_at !== null && new Date(consent.location_expires_at).getTime() > Date.now();

  if (ended) {
    return (
      <div
        className={cn(
          'rounded-element border border-border bg-muted/30 p-4 text-13 text-muted-foreground',
          className,
        )}
        role="status"
      >
        Conversation ended {fmt(consent.ended_at)}.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-2 rounded-element border border-border bg-card p-4 text-13">
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

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Photo unlock — mutual consent */}
        <div className="flex flex-col gap-2 rounded-element border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor={`photo-unlock-${conversationId}`}
              className="inline-flex items-center gap-2 text-sm font-medium"
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
              Unlock my photos
            </Label>
            <Switch
              id={`photo-unlock-${conversationId}`}
              checked={Boolean(myUnlocked)}
              disabled={!side || photoMutation.isPending}
              onCheckedChange={(checked) => photoMutation.mutate(checked)}
            />
          </div>
          <p className="text-13 text-muted-foreground">
            {photosUnlockedBoth
              ? 'Photos are visible to both of you.'
              : myUnlocked
                ? 'Waiting for them to unlock too.'
                : theirUnlocked
                  ? "They've unlocked their photos — toggle yours to share."
                  : 'Both of you have to unlock for photos to appear.'}
          </p>
        </div>

        {/* Location share — single auto-expire timestamp */}
        <div className="flex flex-col gap-2 rounded-element border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4" aria-hidden />
            Share location
          </div>
          {locationActive ? (
            <>
              <p className="text-13 text-muted-foreground">
                Shared until {fmtTime(consent.location_expires_at)}.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => locationMutation.mutate(null)}
                disabled={locationMutation.isPending}
                className="rounded-element"
              >
                Stop sharing
              </Button>
            </>
          ) : (
            <>
              <p className="text-13 text-muted-foreground">
                Auto-expires. Stop any time.
              </p>
              <div className="flex flex-wrap gap-2">
                {LOCATION_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => locationMutation.mutate(p.minutes)}
                    disabled={!side || locationMutation.isPending}
                    className="rounded-element"
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!hasMessages && moves.length > 0 && (
        <div className="rounded-element border border-dashed border-border p-4">
          <p className="mb-2 text-13 text-muted-foreground">
            Pick a prompt to break the ice — you can edit it before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            {moves.map((m) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => onPickOpeningMove?.(m.prompt)}
                className="rounded-badge border border-border px-2.5 py-1 text-13 text-foreground hover:bg-muted/40 transition-colors"
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
