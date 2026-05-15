import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { UsernameSelector } from './UsernameSelector';
import { X } from 'lucide-react';

const DISMISS_KEY = 'qg.username-claim-dismissed';
const PROMPTED_KEY = 'qg.username-claim-prompted';

export function ClaimUsernameBanner() {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1',
  );

  const username = (profile as (Profile & { username?: string | null }) | null)?.username;

  useEffect(() => {
    if (!user || username || dismissed) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(PROMPTED_KEY) === '1') return;
    sessionStorage.setItem(PROMPTED_KEY, '1');
    setOpen(true);
  }, [user, username, dismissed]);

  if (!user) return null;
  if (username) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const handleSave = async () => {
    if (!pending) return;
    setSaving(true);
    const { error } = await updateProfile({ username: pending } as Partial<Profile>);
    setSaving(false);
    if (!error) {
      setOpen(false);
    }
  };

  return (
    <>
      <div className="bg-foreground text-background px-4 py-2 flex items-center justify-between gap-3">
        <p className="text-sm">Claim your unique queer.guide identity</p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="bg-background text-foreground"
          >
            Choose username
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim your username</DialogTitle>
            <DialogDescription>
              Pick a unique handle. Suggestions generated for you, or type your own.
            </DialogDescription>
          </DialogHeader>
          <UsernameSelector value={pending} onChange={setPending} />
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!pending || saving}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ClaimUsernameBanner;
