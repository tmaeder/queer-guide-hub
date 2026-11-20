import { useEffect, useState } from 'react';
import { z } from 'zod';
import { zodFieldErrors } from '@/lib/zodFieldErrors';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound } from '@/components/icons';
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

const STEPS = ['email', 'password', 'confirm'] as const;
type Step = (typeof STEPS)[number];
const STEP_FIELD: Record<Step, 'email' | 'password' | 'consent'> = {
  email: 'email',
  password: 'password',
  confirm: 'consent',
};

/**
 * Three-step signup — email (or Apple), password, consent — creates the account.
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

  const [stepIndex, setStepIndex] = useState(0);
  // Passkey first: on WebAuthn-capable devices the password step offers a
  // passkey as the main path. null = not chosen yet.
  const supportsPasskey = typeof window !== 'undefined' && !!window.PublicKeyCredential;
  const [usePasskey, setUsePasskey] = useState<boolean | null>(supportsPasskey ? null : false);
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

  const [values, setValues] = useState<{ email: string; password: string; consent: boolean }>({
    email: '',
    password: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { email, password, consent } = values;

  // Validate on submit; after the first attempt, revalidate on every change.
  // The consent box validates itself immediately.
  const update = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    if (attempted) setErrors(zodFieldErrors(schema, next));
    else if (!('consent' in patch)) {
      // A step's error clears as soon as the reader edits that field.
      setErrors((prev) => {
        const rest = { ...prev };
        for (const k of Object.keys(patch)) delete rest[k];
        return rest;
      });
    } else {
      const consentError = zodFieldErrors(schema, next).consent;
      setErrors((prev) => {
        const { consent: _drop, ...rest } = prev;
        return consentError ? { ...rest, consent: consentError } : rest;
      });
    }
  };

  useEffect(() => {
    emit('signup_landing_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strength is measured by zxcvbn asynchronously, so it cannot live in the
  // zod schema — schema covers length, this covers entropy.
  const strengthError =
    !usePasskey && password.length >= MIN_PASSWORD_LEN && passwordScore < 2
      ? t('auth.errors.passwordTooWeak', 'Please choose a stronger password')
      : null;

  const onValid = async () => {
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
    const passkey = usePasskey ? `${next ? '&' : '?'}passkey=1` : '';
    navigate(`/onboarding/welcome${next}${passkey}`, { replace: true });
  };

  const onInvalid = (fieldErrors: Record<string, string>) => {
    emit('signup_validation_error', {
      metadata: { fields: Object.keys(fieldErrors) },
    });
  };

  const handleFormSubmit = async () => {
    setAttempted(true);
    const fieldErrors = zodFieldErrors(schema, values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return onInvalid(fieldErrors);
    setIsSubmitting(true);
    try {
      await onValid();
    } finally {
      setIsSubmitting(false);
    }
  };

  const step = STEPS[stepIndex];
  const stepField = STEP_FIELD[step];
  const stepError = errors[stepField] ?? submitError ?? null;

  // Validate only the current step's field, then move on. The final step
  // submits through handleFormSubmit, which re-checks everything.
  const next = () => {
    const fieldErrors = zodFieldErrors(schema, values);
    const own = fieldErrors[stepField];
    if (own) {
      setErrors({ [stepField]: own });
      onInvalid({ [stepField]: own });
      return;
    }
    if (step === 'password' && strengthError) {
      setErrors({ password: strengthError });
      emit('signup_validation_error', { metadata: { error: 'password_too_weak' } });
      return;
    }
    setErrors({});
    setSubmitError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const back = () => {
    setErrors({});
    setSubmitError(null);
    // Stepping back onto the password step re-offers the choice.
    if (step === 'confirm' && usePasskey) {
      setUsePasskey(null);
      update({ password: '' });
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  // The account still needs a password underneath (Supabase email signup), so
  // the passkey path sets a random one nobody sees. The passkey itself is
  // enrolled on the first onboarding screen, where the session exists; until
  // then "Forgot password" is the way back in.
  const choosePasskey = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const random = btoa(String.fromCharCode(...bytes));
    setUsePasskey(true);
    setValues((v) => ({ ...v, password: random }));
    setErrors({});
    setStepIndex(STEPS.indexOf('confirm'));
  };

  const titles: Record<Step, string> = {
    email: t('auth.signup.title', 'Create your account'),
    password:
      usePasskey === null
        ? t('auth.signup.passkeyTitle', 'How will you sign in?')
        : t('auth.signup.passwordTitle', 'Choose a password'),
    confirm: t('auth.signup.confirmTitle', 'One last thing'),
  };
  const blurbs: Record<Step, string> = {
    email: t('auth.signup.blurb', 'Free, takes a minute.'),
    password:
      usePasskey === null
        ? t('auth.signup.passkeyBlurb', 'A passkey uses your face, fingerprint or device PIN.')
        : t('auth.signup.passwordBlurb', 'At least 8 characters. Longer is stronger.'),
    confirm: t('auth.signup.confirmBlurb', 'Confirm and your account is ready.'),
  };

  return (
    <Card className="max-w-md mx-auto rounded-container">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <ol
            className="m-0 flex list-none gap-2 p-0"
            aria-label={t('auth.signup.progress', {
              defaultValue: 'Step {{n}} of {{total}}',
              n: stepIndex + 1,
              total: STEPS.length,
            })}
          >
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`h-1 flex-1 rounded-full transition-colors duration-normal ${
                  i <= stepIndex ? 'bg-foreground' : 'bg-muted'
                }`}
              />
            ))}
          </ol>
          <p className="text-center text-2xs uppercase tracking-label text-muted-foreground">
            {t('auth.signup.progress', {
              defaultValue: 'Step {{n}} of {{total}}',
              n: stepIndex + 1,
              total: STEPS.length,
            })}
          </p>
          <CardTitle className="text-center text-headline font-bold tracking-tight text-balance">
            {titles[step]}
          </CardTitle>
          <CardDescription className="text-center text-15">{blurbs[step]}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          {step === 'email' && (
            <>
              <OAuthButtons onError={setSubmitError} />
              <div className="flex items-center gap-4" role="separator">
                <span className="h-px flex-1 bg-border-hairline" aria-hidden />
                <span className="text-2xs uppercase tracking-label text-muted-foreground">
                  {t('auth.signup.orWithEmail', 'Or with email')}
                </span>
                <span className="h-px flex-1 bg-border-hairline" aria-hidden />
              </div>
            </>
          )}

          {stepError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{stepError}</AlertDescription>
            </Alert>
          )}

          {/* noValidate is load-bearing: native constraint validation blocks
              submit BEFORE the handler runs and emits no telemetry, so the
              funnel could not distinguish "never tried" from "tried and was
              stopped". Every rejection now goes through onInvalid. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step !== 'confirm') return next();
              emit('signup_submit_attempt');
              void handleFormSubmit();
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            {step === 'email' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="signup-email">{t('auth.fields.email', 'Email')}</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder={t('auth.placeholders.email', 'you@example.com')}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  name="email"
                  value={email}
                  onChange={(e) => update({ email: e.target.value })}
                />
              </div>
            )}

            {step === 'password' && usePasskey === null && (
              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" onClick={choosePasskey} className="w-full">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  {t('auth.signup.usePasskey', 'Use a passkey')}
                </Button>
                <p className="text-center text-13 text-muted-foreground">
                  {t('auth.signup.passkeyWhy', 'Nothing to remember, nothing to leak.')}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setUsePasskey(false)}
                  className="w-full"
                >
                  {t('auth.signup.usePassword', 'Use a password instead')}
                </Button>
              </div>
            )}

            {step === 'password' && usePasskey === false && (
              <div className="flex flex-col gap-2">
                {/* The email rides along for password managers. */}
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  readOnly
                  hidden
                />
                <Label htmlFor="signup-password">{t('auth.fields.password', 'Password')}</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    placeholder={t('auth.placeholders.passwordMin8', 'At least 8 characters')}
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    name="password"
                    value={password}
                    onChange={(e) => update({ password: e.target.value })}
                    className="pe-12"
                  />
                  {/* Inside the field, end-aligned — same as sign-in. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 end-0 my-auto"
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
            )}

            {step === 'confirm' && (
              <>
                <div className="flex items-center justify-between gap-4 rounded-element bg-muted px-4 py-2 text-13">
                  <span className="min-w-0 break-words">
                    <span className="text-muted-foreground">
                      {t('auth.signup.signingUpAs', 'Signing up as')}
                    </span>{' '}
                    <span className="font-bold">{email}</span>
                    {usePasskey && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('auth.signup.passkeyAfter', 'You add your passkey on the next screen.')}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStepIndex(0)}
                    disabled={isSubmitting}
                  >
                    {t('auth.signup.change', 'Change')}
                  </Button>
                </div>
                <Label className="flex items-start gap-4 rounded-element bg-muted p-4 text-13 font-normal leading-relaxed text-muted-foreground">
                  <Checkbox
                    id="signup-consent"
                    checked={consent === true}
                    onCheckedChange={(v) => update({ consent: v === true })}
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
              </>
            )}

            <div className="mt-2 flex gap-2">
              {stepIndex > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={back}
                  disabled={isSubmitting}
                  aria-label={t('auth.signup.back', 'Back')}
                  className="px-4"
                >
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className={`flex-1 ${step === 'password' && usePasskey === null ? 'hidden' : ''}`}
              >
                {isSubmitting && <TrackLoader size={16} className="mr-2" />}
                {step === 'confirm'
                  ? t('auth.signup.create', 'Create account')
                  : t('auth.signup.continue', 'Continue')}
                {step !== 'confirm' && (
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                )}
              </Button>
            </div>
          </form>

          <div className="border-t border-border-hairline pt-4 text-center">
            <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
              <span className="text-13 text-muted-foreground">
                {t('auth.signup.haveAccountQ', 'Already have an account? Sign in')}
              </span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
