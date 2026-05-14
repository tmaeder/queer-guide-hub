import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Heart, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { OAuthButtons } from './OAuthButtons';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { EmailVerificationScreen } from './EmailVerificationScreen';

interface Props {
  onBack: () => void;
}

const MIN_PASSWORD_LEN = 8;

export default function Signup({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const { emit, reset: resetFunnel } = useSignupFunnel();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordScore, setPasswordScore] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  useEffect(() => {
    emit('signup_landing_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (): string | null => {
    if (!email) return t('auth.errors.emailRequired', 'Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return t('auth.errors.emailInvalid', 'Please enter a valid email address');
    if (!password) return t('auth.errors.passwordRequired', 'Password is required');
    if (password.length < MIN_PASSWORD_LEN)
      return t('auth.errors.passwordTooShort', { defaultValue: 'Password must be at least {{n}} characters', n: MIN_PASSWORD_LEN });
    if (passwordScore < 2)
      return t('auth.errors.passwordTooWeak', 'Please choose a stronger password');
    if (!consent)
      return t('auth.errors.consentRequired', 'Please accept the terms, privacy policy, and confirm you are 18+');
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      emit('signup_validation_error', { metadata: { error: err } });
      return;
    }
    setIsLoading(true);
    setError(null);

    const now = new Date().toISOString();
    const { error: signUpError } = await signUp(email, password, {
      display_name: email.split('@')[0],
      preferred_language: i18n.language,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      age_confirmed_at: now,
    });

    setIsLoading(false);

    if (signUpError) {
      const msg = signUpError instanceof Error
        ? signUpError.message
        : (signUpError as { message?: string })?.message ?? '';
      if (msg.includes('User already registered')) {
        setError(t('auth.errors.alreadyRegistered', 'An account with this email already exists. Try signing in.'));
      } else {
        setError(msg || t('auth.errors.unexpected', 'An unexpected error occurred. Please try again.'));
      }
      emit('signup_validation_error', { metadata: { error: msg } });
      return;
    }

    emit('signup_completed', { provider: 'email' });
    setVerificationEmail(email);
    resetFunnel();
  };

  if (verificationEmail) {
    return <EmailVerificationScreen email={verificationEmail} onBackToLogin={onBack} />;
  }

  return (
    <Card className="max-w-md mx-auto rounded-3xl shadow-xl">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-2">
            <Heart className="w-8 h-8 fill-current text-foreground" />
            <h5 className="text-xl font-bold tracking-tight">The Queer Guide</h5>
          </div>
          <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-center text-balance">
            {t('auth.signup.title', 'Create your account')}
          </CardTitle>
          <CardDescription className="text-center text-sm">
            {t('auth.signup.blurb', 'Free, takes a minute.')}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          <OAuthButtons onError={setError} />

          <div className="relative text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative bg-background px-2 text-xs text-muted-foreground uppercase">
              {t('auth.signup.orWithEmail', 'Or with email')}
            </span>
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-email">{t('auth.fields.email', 'Email')}</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder={t('auth.placeholders.email', 'you@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-password">{t('auth.fields.password', 'Password')}</Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t('auth.placeholders.passwordMin8', 'At least 8 characters')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  minLength={MIN_PASSWORD_LEN}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <PasswordStrengthMeter
                password={password}
                email={email}
                onScoreChange={setPasswordScore}
              />
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="signup-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                aria-label={t('auth.consent.combinedAria', 'Accept terms, privacy and confirm 18+')}
                className="mt-0.5"
                disabled={isLoading}
              />
              <Label htmlFor="signup-consent" className="text-sm font-normal text-muted-foreground">
                <Trans i18nKey="auth.consent.combined">
                  I agree to the <LocalizedLink to="/terms">Terms</LocalizedLink> and{' '}
                  <LocalizedLink to="/privacy">Privacy Policy</LocalizedLink>, and confirm I am 18 or older.
                </Trans>
              </Label>
            </div>

            <Button type="submit" disabled={isLoading} className="mt-2">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('auth.signup.create', 'Create account')}
            </Button>
          </form>

          <div className="text-center pt-2 border-t border-border">
            <Button variant="ghost" onClick={onBack} disabled={isLoading}>
              <span className="text-sm text-muted-foreground">
                {t('auth.signup.haveAccountQ', 'Already have an account? Sign in')}
              </span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
