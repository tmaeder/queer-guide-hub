import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const MIN_PASSWORD_LEN = 8;

/**
 * Set a new password from a recovery link.
 *
 * Reachable two ways: the link's own redirect, and RecoveryRedirect forwarding
 * a recovery session that landed anywhere else. Until this page existed a
 * recovery link just signed the user in silently and dropped them on the home
 * page, so there was no way to finish a password reset at all.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, loading, passwordRecovery, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A recovery link mints a real session, so `user` alone cannot tell a
  // recovery apart from an ordinary visit. Require the recovery flag — an
  // already-signed-in user who wanders here should use Settings instead.
  const canReset = passwordRecovery && !!user;

  useEffect(() => {
    if (!loading && !passwordRecovery && user) {
      navigate('/settings', { replace: true });
    }
  }, [loading, passwordRecovery, user, navigate]);

  const validate = (): string | null => {
    if (!password) return t('auth.errors.passwordRequired', 'Password is required');
    if (password.length < MIN_PASSWORD_LEN)
      return t('auth.errors.passwordTooShort', {
        defaultValue: 'Password must be at least {{n}} characters',
        n: MIN_PASSWORD_LEN,
      });
    if (score < 2) return t('auth.errors.passwordTooWeak', 'Please choose a stronger password');
    if (password !== confirm) return t('auth.reset.errors.mismatch', 'Both passwords must match.');
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setIsSaving(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setIsSaving(false);
    if (updateError) {
      const msg =
        updateError instanceof Error
          ? updateError.message
          : ((updateError as { message?: string })?.message ?? '');
      setError(
        msg || t('auth.errors.unexpected', 'An unexpected error occurred. Please try again.'),
      );
      return;
    }
    toast({ title: t('auth.reset.success', 'Password updated.') });
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center"
        role="status"
        aria-label={t('common.loading', 'Loading')}
      >
        <TrackLoader size={24} />
      </div>
    );
  }

  // No recovery session: the link was already used, expired, or opened in a
  // different browser than the one that requested it. Say so and offer the way
  // back — never a blank page.
  if (!canReset) {
    return (
      <PageContainer size="form">
        <Card className="rounded-container">
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight text-center text-balance">
              {t('auth.reset.expiredTitle', 'This reset link has expired')}
            </CardTitle>
            <CardDescription className="text-center text-sm">
              {t(
                'auth.reset.expiredBody',
                'Reset links work once and only in the browser that requested them. Request a new one to continue.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <LocalizedLink to="/auth">
                {t('auth.reset.requestNew', 'Request a new link')}
              </LocalizedLink>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="form">
      <Card className="rounded-container">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight text-center text-balance">
            {t('auth.reset.title', 'Set a new password')}
          </CardTitle>
          <CardDescription className="text-center text-sm">
            {t('auth.reset.blurb', 'Choose a new password for your account.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">{t('auth.reset.newPassword', 'New password')}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword
                      ? t('auth.hidePassword', 'Hide password')
                      : t('auth.showPassword', 'Show password')
                  }
                  disabled={isSaving}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <PasswordStrengthMeter password={password} onScoreChange={setScore} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">
                {t('auth.reset.confirmPassword', 'Confirm new password')}
              </Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <Button type="submit" disabled={isSaving} className="mt-2">
              {isSaving && <TrackLoader size={16} className="mr-2" />}
              {t('auth.reset.submit', 'Update password')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
