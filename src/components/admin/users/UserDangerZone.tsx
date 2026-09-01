/**
 * Destructive account actions for one user, on the moderation tab.
 *
 * Deliberately single-user and deliberately not in the bulk bar: the bulk bar's
 * raw `DELETE FROM profiles` was the defect this replaces. `profiles` has
 * NO-ACTION FK blockers, storage objects with no FK, and an `auth.users` row a
 * table delete never touches — so both actions go through the
 * `admin-delete-user` edge function, which calls the RPC and then finishes the
 * parts SQL cannot reach.
 *
 * Confirmation is the target's own username re-typed, matching the friction the
 * self-serve deletion already demands. A destructive action taken on someone
 * ELSE's account should not be easier than on your own.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, UserMinus, AlertTriangle } from 'lucide-react';

type Mode = 'delete' | 'anonymize';

interface UserDangerZoneProps {
  userId: string;
  /** Username, or email when there is no username — what must be re-typed. */
  confirmationHandle: string | null;
  displayName: string;
  /** Called after a successful action so the list and sheet can refresh. */
  onDone: () => void;
}

const COPY: Record<Mode, { title: string; verb: string; body: string; warn: string }> = {
  delete: {
    title: 'Delete account',
    verb: 'Delete account',
    body: 'Removes the profile, every personal row attached to it, the uploaded files, and the login itself.',
    warn: 'This cannot be undone. There is no trash for accounts — a deletion audit records that it happened, deliberately without the data.',
  },
  anonymize: {
    title: 'Anonymize account',
    verb: 'Anonymize account',
    body: 'Strips every profile field and deletes the uploaded files, but keeps the account and anything they contributed, so venues and events they created keep working.',
    warn: 'This cannot be undone. The profile keeps only its creation date and moderation status.',
  },
};

export function UserDangerZone({
  userId,
  confirmationHandle,
  displayName,
  onDone,
}: UserDangerZoneProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setMode(null);
    setConfirmation('');
    setReason('');
  };

  const run = async () => {
    if (!mode) return;
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: userId, mode, reason: reason.trim() || null, confirmation },
        headers: { Authorization: `Bearer ${token}` },
      });

      // functions.invoke surfaces a non-2xx as `error` with the body buried in
      // the context; read it so the RPC's own refusals ("account holds the
      // admin role", "use the account settings flow") reach the admin as words
      // rather than "Edge Function returned a non-2xx status code".
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const parsed = await ctx.json();
            if (parsed?.error) detail = parsed.error;
          } catch {
            /* keep the generic message */
          }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      toast.success(mode === 'delete' ? 'Account deleted' : 'Account anonymized');
      close();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const expected = (confirmationHandle ?? '').trim();
  const matches = expected.length > 0 && confirmation.trim().toLowerCase() === expected.toLowerCase();

  return (
    <>
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-sm font-bold mb-2">Danger zone</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Suspending or banning is reversible and is usually the right action. The two below are
          not.
        </p>

        {!expected && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              This account has no username or email, so there is nothing to type as confirmation.
              Neither action can run against it.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!expected}
            onClick={() => setMode('anonymize')}
          >
            <UserMinus size={14} className="mr-2" />
            Anonymize
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!expected}
            onClick={() => setMode('delete')}
            style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive))' }}
          >
            <Trash2 size={14} className="mr-2" />
            Delete account
          </Button>
        </div>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode ? COPY[mode].title : ''}</DialogTitle>
            <DialogDescription>{mode ? COPY[mode].body : ''}</DialogDescription>
          </DialogHeader>

          {mode && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{COPY[mode].warn}</AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="dz-reason" className="text-xs">
                  Reason (recorded in the audit log)
                </Label>
                <Textarea
                  id="dz-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this account being removed?"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dz-confirm" className="text-xs">
                  Type <span className="font-mono font-bold">{expected}</span> to confirm
                </Label>
                <Input
                  id="dz-confirm"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  aria-describedby="dz-confirm-help"
                />
                <p id="dz-confirm-help" className="text-xs text-muted-foreground">
                  {displayName}&rsquo;s handle. The server checks this too.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={run}
              disabled={!matches || busy}
              style={{
                backgroundColor: 'hsl(var(--destructive))',
                color: 'hsl(var(--track-ring))',
              }}
            >
              {busy ? 'Working…' : mode ? COPY[mode].verb : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
