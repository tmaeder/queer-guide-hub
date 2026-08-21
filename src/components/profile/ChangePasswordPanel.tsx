import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const MIN_PASSWORD_LEN = 8;

/**
 * Change password from Settings.
 *
 * Until this shipped there was no way for a signed-in user to change their
 * password anywhere in the app — the only path was the reset email, which
 * itself dead-ended.
 */
export function ChangePasswordPanel() {
  const { updatePassword } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }
    if (score < 2) {
      setError('Please choose a stronger password');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setSaving(false);
    if (updateError) {
      const msg =
        updateError instanceof Error
          ? updateError.message
          : ((updateError as { message?: string })?.message ?? '');
      setError(msg || 'Could not update your password. Please try again.');
      return;
    }
    setPassword('');
    setConfirm('');
    toast({ title: 'Password updated.' });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <p className="font-semibold">Password</p>
        <p className="text-sm text-muted-foreground">
          Changing this signs out nothing else — other devices stay signed in.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-new-password">New password</Label>
        <Input
          id="settings-new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={saving}
        />
        <PasswordStrengthMeter password={password} onScoreChange={setScore} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-confirm-password">Confirm new password</Label>
        <Input
          id="settings-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={saving}
        />
      </div>

      <Button type="submit" disabled={saving || !password} className="self-start">
        {saving && <TrackLoader size={16} className="mr-2" />}
        Update password
      </Button>
    </form>
  );
}
