import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTurnstile } from '@/hooks/useTurnstile';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { OAuthButtons } from './OAuthButtons';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

interface Props {
  onBack: () => void;
  /** Where to send the user after onboarding, forwarded from ?redirect=. */
  redirectTo?: string;
}

const MIN_PASSWORD_LEN = 8;

/**
 * One-screen signup: email + password + consent creates the account.
 *
 * Username and avatar used to be a mandatory second screen BEFORE the account
 * existed. They now live in onboarding, because `handle_new_user` mints both
 * inline (migration 20260915090000) — so a user who never finishes onboarding
 * still gets a real handle and avatar, and crucially a display_name that is
 * not their email local part.
 *
 * There is no verification screen. Prod runs autoconfirm
 * (`enable_confirmations = false`), so `signUp` resolves with a live session
 * already notified to onAuthStateChange — the old EmailVerificationScreen was
 * unreachable by construction and the user was simply bounced to "/".
 */
export default function Signup({ onBack, redirectTo }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { signUp } = useAuth();
  const { emit, reset: resetFunnel } = useSignupFunnel();
  const {
    token: captchaToken,
    widget: captcha,
    reset: resetCaptcha,
    required: captchaRequired,
  } = useTurnstile();

  const [showPassword, setShowPassword] = useState(false);
  const [passwordScore, setPasswordScore] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Built inside the component so validation messages follow the active
  // language rather than being frozen at module load.
  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.errors.emailRequired', 'Email is required'))
      .regex(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        t('auth.errors.emailInvalid', 'Please enter a valid email address'),
      ),
    password: z.string().min(
      MIN_PASSWORD_LEN,
      t('auth.errors.passwordTooShort', {
        defaultValue: 'Password must be at least {{n}} characters',
        n: MIN_PASSWORD_LEN,
      }),
    ),
    consent: z.literal(true, {
      message: t(
        'auth.errors.consentRequired',
        'Please accept the terms, privacy policy, and confirm you are 18+',
      ),
    }),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '', consent: false as never },
  });

  const email = watch('email');
  const password = watch('password');
  const consent = watch('consent');

  useEffect(() => {
    emit('signup_landing_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strength is measured by zxcvbn asynchronously, so it cannot live in the
  // zod schema — schema covers length, this covers entropy.
  const strengthError =
    password.length >= MIN_PASSWORD_LEN && passwordScore < 2
      ? t('auth.errors.passwordTooWeak', 'Please choose a stronger password')
      : null;

  const onValid = async (values: FormValues) => {
    if (strengthError) {
      setSubmitError(strengthError);
      emit('signup_validation_error', { metadata: { error: 'password_too_weak' } });
      return;
    }
    if (captchaRequired && !captchaToken) {
      setSubmitError(t('auth.errors.captchaRequired', 'Please complete the captcha.'));
      return;
    }

    setSubmitError(null);
    const now = new Date().toISOString();
    // Only the consent timestamps. display_name is derived by the trigger
    // (passing an email-derived one makes it look deliberate), username and
    // avatar are minted there too, and signup_provider comes from
    // raw_app_meta_data which the client cannot forge.
    const { error: signUpError } = await signUp(
      values.email,
      values.password,
      {
        terms_accepted_at: now,
        privacy_accepted_at: now,
        age_confirmed_at: now,
      },
      captchaToken ?? undefined,
    );

    if (signUpError) {
      // Turnstile tokens are single-use — refresh for the next attempt.
      resetCaptcha();
      const msg =
        signUpError instanceof Error
          ? signUpError.message
          : ((signUpError as { message?: string })?.message ?? '');
      setSubmitError(
        msg || t('auth.errors.unexpected', 'An unexpected error occurred. Please try again.'),
      );
      return;
    }

    emit('signup_completed', { provider: 'email' });
    resetFunnel();
    // Autoconfirm means the session already exists by the time signUp resolves,
    // so go straight to onboarding rather than a dead-end "check your email".
    // `replace` keeps Back from returning to a signup form for an account that
    // now exists. Auth.tsx deliberately suppresses its own signed-in redirect
    // while mode==='signup' so it cannot race this to "/".
    const next =
      redirectTo && redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : '';
    navigate(`/onboarding/welcome${next}`, { replace: true });
  };

  const onInvalid = () => {
    emit('signup_validation_error', {
      metadata: { fields: Object.keys(errors) },
    });
  };

  const firstError =
    submitError ??
    errors.email?.message ??
    errors.password?.message ??
    errors.consent?.message ??
    null;

  return (
    <Card className="max-w-md mx-auto rounded-container">
      <CardHeader>
        <div className="flex flex-col gap-4">
          {/* Wordmark alone — see Auth.tsx. */}
          <div className="flex items-center justify-center">
            <Wordmark className="text-title text-foreground" />
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
          <OAuthButtons onError={setSubmitError} />

          <div className="relative text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" />
            </div>
            <span className="relative bg-background px-2 text-xs text-muted-foreground uppercase">
              {t('auth.signup.orWithEmail', 'Or with email')}
            </span>
          </div>

          {firstError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{firstError}</AlertDescription>
            </Alert>
          )}

          {/* noValidate is load-bearing: native constraint validation blocks
              submit BEFORE the handler runs and emits no telemetry, so the
              funnel could not distinguish "never tried" from "tried and was
              stopped". Every rejection now goes through onInvalid. */}
          <form
            onSubmit={(e) => {
              emit('signup_submit_attempt');
              void handleSubmit(onValid, onInvalid)(e);
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-email">{t('auth.fields.email', 'Email')}</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder={t('auth.placeholders.email', 'you@example.com')}
                disabled={isSubmitting}
                aria-invalid={!!errors.email}
                {...register('email')}
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
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  {...register('password')}
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
                  disabled={isSubmitting}
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

            <Label className="flex items-start gap-2 pt-1 text-sm font-normal text-muted-foreground">
              <Checkbox
                id="signup-consent"
                checked={consent === true}
                onCheckedChange={(v) =>
                  setValue('consent', (v === true) as never, { shouldValidate: true })
                }
                aria-label={t(
                  'auth.consent.combinedAria',
                  'Accept terms, privacy, confirm 18 or older, and acknowledge the 18+ dating platform',
                )}
                className="mt-0.5"
                disabled={isSubmitting}
              />
              <span>
                {/* components map (not JSX children) — child-index inference broke when a formatter split " and " into two text nodes, dropping the <3> link */}
                <Trans
                  i18nKey="auth.consent.combined"
                  defaults="I agree to the <1>Terms</1> and <3>Privacy Policy</3>, confirm I am 18 or older, and understand Queer Guide is an 18+ platform that includes dating and intimate features."
                  components={{
                    1: <LocalizedLink to="/terms">Terms</LocalizedLink>,
                    3: <LocalizedLink to="/privacy">Privacy Policy</LocalizedLink>,
                  }}
                />
              </span>
            </Label>

            {captcha}

            <Button type="submit" disabled={isSubmitting} className="mt-2">
              {isSubmitting && <TrackLoader size={16} className="mr-2" />}
              {t('auth.signup.create', 'Create account')}
            </Button>
          </form>

          <div className="text-center pt-2">
            <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
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
