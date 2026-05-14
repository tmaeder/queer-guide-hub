import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';

interface Props {
  /** Whether the gated content this modal protects is currently being accessed. */
  active: boolean;
  /** Called when the visitor declines (modal close / "Take me back"). */
  onDecline: () => void;
}

/**
 * Renders the 18+ age-affirmation modal when `active` is true and the
 * visitor has not yet affirmed. Persists affirmation via useAgeAffirmation
 * (30-day localStorage TTL). Until affirmed, gated children must NOT be
 * rendered by callers — this modal does not unmount the page itself.
 *
 * P0-3.
 */
export function AgeAffirmationModal({ active, onDecline }: Props) {
  const { t } = useTranslation();
  const { affirmed, affirm } = useAgeAffirmation();

  const open = active && !affirmed;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Explicit close (overlay/escape) counts as decline — gate stays up.
        if (!next) onDecline();
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid="age-affirmation-modal"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            {t('age_gate.title', 'Adult content ahead')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'age_gate.body',
              'This page covers sexuality and kink topics intended for adults. By continuing you confirm you are 18 or older.',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onDecline} data-testid="age-affirmation-decline">
            {t('age_gate.decline', 'Take me back')}
          </Button>
          <Button onClick={affirm} data-testid="age-affirmation-confirm">
            {t('age_gate.confirm', 'I am 18 or older')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
