import { useState } from 'react';
import { Download, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface DangerZoneProps {
  /** The user's username, re-typed to confirm deletion. Falls back to email. */
  username?: string | null;
}

/**
 * GDPR Art. 20 (export) + Art. 17 (erasure) self-service controls.
 * Calls the `export-my-data` and `delete-account` edge functions (both
 * self-scoped via the caller's JWT).
 */
export function DangerZone({ username }: DangerZoneProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Re-typed value must match username, or email if no username is set.
  const expected = (username ?? user?.email ?? '').trim();
  const canDelete = expected.length > 0 && confirmText.trim().toLowerCase() === expected.toLowerCase();

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-my-data');
      if (error || !data) throw error ?? new Error('No data returned');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `queerguide-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Your data has been downloaded.' });
    } catch (e) {
      console.error('export failed', e);
      toast({ title: "Couldn't prepare your data. Please try again.", variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: confirmText.trim() },
      });
      if (error || !data?.success) throw error ?? new Error('Deletion failed');
      toast({ title: 'Your account has been deleted.' });
      await signOut();
      window.location.assign('/');
    } catch (e) {
      console.error('delete failed', e);
      toast({ title: "Couldn't delete your account. Please contact support.", variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardContent className="pt-6 flex flex-col gap-6">
        <div>
          <p className="font-semibold">Your data</p>
          <p className="text-sm text-muted-foreground">
            Download a copy of everything we hold about you, or permanently delete your account.
          </p>
        </div>

        {/* Export — Art. 20 portability */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Download my data</p>
          <p className="text-sm text-muted-foreground">
            Get a copy of your profile, activity, and saved content as a JSON file.
          </p>
          <div>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? 'Preparing your data…' : 'Download my data'}
            </Button>
          </div>
        </div>

        {/* Delete — Art. 17 erasure */}
        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <p className="text-sm font-medium">Delete my account</p>
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all personal data. This cannot be undone.
          </p>
          <div>
            <Button variant="destructive" onClick={() => { setConfirmText(''); setDialogOpen(true); }}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete my account
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={dialogOpen} onOpenChange={(o) => { if (!deleting) setDialogOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your profile, identity and dating data, messages, trips you own, photos,
              and all your activity. This is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-semibold">{expected || 'your username'}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expected || 'your username'}
              autoComplete="off"
              disabled={deleting}
            />
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!canDelete || deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {deleting ? 'Deleting your account…' : 'Delete forever'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
