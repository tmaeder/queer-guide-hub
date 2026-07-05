import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Lock, Scale, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useMyKinkGrants, useSetKinkGrant, useKinkCompareStatus } from '@/hooks/useKinkGrants';
import { useMyKinkRatings } from '@/hooks/useKinkRatings';
import { KinkCompareView } from '@/components/kinks/KinkCompareView';

interface KinkPeerActionsProps {
  otherId: string;
  otherName?: string | null;
  conversationId?: string | null;
  /** Compose hook for "ask about X" opening lines (match threads). */
  onOpeningLine?: (line: string) => void;
}

/**
 * Per-person checklist actions: revocable "unlock my list" (ddirt pattern,
 * receipt fires in-thread when a conversation is anchored) + the two-sided
 * compare handshake with the intersection view.
 */
export function KinkPeerActions({
  otherId,
  otherName,
  conversationId,
  onOpeningLine,
}: KinkPeerActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: myRatings } = useMyKinkRatings();
  const { data: grants } = useMyKinkGrants();
  const { data: status } = useKinkCompareStatus(otherId);
  const setGrant = useSetKinkGrant();
  const [compareOpen, setCompareOpen] = useState(false);

  if (!user || user.id === otherId) return null;

  const hasList = (myRatings?.size ?? 0) > 0;
  const viewGrantActive = (grants ?? []).some(
    (g) => g.grantor_id === user.id && g.grantee_id === otherId && g.kind === 'view' && !g.revoked_at,
  );

  if (!hasList) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-13 text-muted-foreground">
          Fill in your own checklist to unlock sharing and comparison.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-element"
          onClick={() => navigate('/tools/checklist')}
        >
          Open checklist
        </Button>
      </div>
    );
  }

  const toggleUnlock = async () => {
    await setGrant.mutateAsync({
      otherId,
      kind: 'view',
      active: !viewGrantActive,
      conversationId,
    });
    toast({
      title: viewGrantActive
        ? 'Locked again. They no longer see your unlocked categories.'
        : 'Unlocked. They can now see categories you set to "People I unlock".',
    });
  };

  const compareAction = async () => {
    if (status === 'active') {
      setCompareOpen(true);
      return;
    }
    await setGrant.mutateAsync({ otherId, kind: 'compare', active: true, conversationId });
    toast({
      title:
        status === 'requested_by_other'
          ? 'Compare unlocked for both of you.'
          : 'Compare requested. They need to accept before either list is used.',
    });
    if (status === 'requested_by_other') setCompareOpen(true);
  };

  const compareLabel =
    status === 'active'
      ? 'View shared interests'
      : status === 'requested_by_me'
        ? 'Compare requested…'
        : status === 'requested_by_other'
          ? 'Accept compare'
          : 'Compare interests';

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-element"
        disabled={setGrant.isPending}
        onClick={toggleUnlock}
      >
        {viewGrantActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        {viewGrantActive ? 'Lock my list' : 'Unlock my list for them'}
      </Button>
      <Button
        variant={status === 'requested_by_other' ? 'default' : 'outline'}
        size="sm"
        className="gap-1.5 rounded-element"
        disabled={setGrant.isPending || status === 'requested_by_me'}
        onClick={compareAction}
      >
        <Scale className="h-4 w-4" />
        {compareLabel}
      </Button>
      {status === 'active' && (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-element text-muted-foreground"
          disabled={setGrant.isPending}
          onClick={async () => {
            await setGrant.mutateAsync({ otherId, kind: 'compare', active: false, conversationId });
            toast({ title: 'Compare withdrawn.' });
          }}
        >
          Withdraw
        </Button>
      )}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto rounded-container">
          <DialogHeader>
            <DialogTitle>Shared interests</DialogTitle>
          </DialogHeader>
          <p className="text-13 text-muted-foreground">
            Only what you BOTH marked positively, with giving/receiving matched. Nothing
            one-sided is ever shown.
          </p>
          <KinkCompareView
            otherId={otherId}
            otherName={otherName}
            onOpeningLine={
              onOpeningLine
                ? (line) => {
                    onOpeningLine(line);
                    setCompareOpen(false);
                  }
                : undefined
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
