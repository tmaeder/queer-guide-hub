import { ChangePasswordPanel } from '@/components/profile/ChangePasswordPanel';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Check,
  Fingerprint,
  Heart,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
} from '@/components/icons';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { StepperShell, type StepperStep } from '@/components/ui/StepperShell';
import { TierUpgradeOverlay } from '@/components/ui/TierUpgradeOverlay';
import { ProfileSetupStep } from '@/components/onboarding/ProfileSetupStep';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { sanitizeRedirect } from '@/lib/authRedirect';
import type { AvatarConfig } from '@/components/profile/avatarConfig';

export default function Welcome() {
  const navigate = useLocalizedNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, hasPasskey, enrollPasskey } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { emit } = useSignupFunnel();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [enrolling, setEnrolling] = useState(false);
  const [enrollErr, setEnrollErr] = useState<string | null>(null);
  // Passkey path only: if enrolment fails, a password is the way in instead.
  const [passwordFallback, setPasswordFallback] = useState(false);
  const [step, setStep] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const px = profile as (Profile & { username?: string | null }) | null;
  const [profileSaving, setProfileSaving] = useState(false);

  // Derived, not synced-by-effect: the edit is an OVERRIDE on top of whatever
  // handle_new_user already assigned. Seeding state from `profile` in an
  // effect instead would cascade a render and, worse, race the profile fetch —
  // if it resolved after mount the step would open blank and "Continue" would
  // look like it was about to clear the user's handle.
  const [usernameOverride, setUsernameOverride] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<AvatarConfig | null>(null);
  const username = usernameOverride ?? px?.username ?? null;
  const avatar = avatarOverride ?? (px?.avatar_config as unknown as AvatarConfig) ?? null;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (user) emit('email_verified', { metadata: { user_id: user.id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  // Came from the passkey path of signup: the account has a random password
  // nobody knows, so the passkey is the first thing to set up.
  const passkeyFirst = searchParams.get('passkey') === '1';

  const steps: StepperStep[] = useMemo(() => {
    const all: StepperStep[] = [
      {
        id: 'profile',
        label: t('onboarding.steps.profile', 'Your handle'),
        description: t(
          'onboarding.steps.profileDesc',
          'Pick a username and avatar, or keep the ones we assigned.',
        ),
      },
      {
        id: 'passkey',
        label: t('onboarding.steps.passkey', 'Secure access'),
        description: t(
          'onboarding.steps.passkeyDesc',
          'Set up a passkey for faster, password-free sign-in.',
        ),
      },
      {
        id: 'personalize',
        label: t('onboarding.steps.personalize', 'Personalize'),
        description: t('onboarding.steps.personalizeDesc', 'Tell us what you want to discover.'),
      },
      {
        id: 'trust',
        label: t('onboarding.steps.trust', 'Trust tier'),
        description: t('onboarding.steps.trustDesc', 'Your community standing begins here.'),
      },
    ];
    if (!passkeyFirst) return all;
    return [all[1], all[0], ...all.slice(2)];
  }, [t, passkeyFirst]);

  const handleEnrollPasskey = async () => {
    setEnrolling(true);
    setEnrollErr(null);
    const { error } = await enrollPasskey();
    setEnrolling(false);
    if (error) {
      setEnrollErr(error.message ?? 'Passkey enrollment failed');
    } else {
      toast({ title: t('onboarding.passkeyEnrolled', 'Passkey enabled') });
    }
  };

  const finish = async (skipped: boolean) => {
    emit(skipped ? 'onboarding_skipped' : 'onboarding_completed');
    setShowUpgrade(false);

    // Stamped on BOTH exits. A skipped onboarding is a finished one — recording
    // only completions would re-show this flow to every skipper on each OAuth
    // return, forever. The funnel event above is what distinguishes the two.
    // Column existed since launch and was never written by anything.
    if (user) {
      await updateProfile({
        onboarding_completed_at: new Date().toISOString(),
      } as Partial<Profile>);
    }

    // Honour where the user was headed before being gated into auth.
    navigate(sanitizeRedirect(searchParams.get('redirect')) ?? '/', { replace: true });
  };

  const stepId = steps[step]?.id;

  const handleNext = async () => {
    // Persist the profile step before leaving it. Both values are already
    // non-null (the trigger assigned them), so this only writes a change the
    // user actually made.
    if (stepId === 'profile' && user) {
      // Only the overrides are a change; the derived values equal what the
      // trigger already stored.
      const changed = usernameOverride !== null || avatarOverride !== null;
      if (changed) {
        setProfileSaving(true);
        await updateProfile({
          ...(username ? { username } : {}),
          ...(avatar ? { avatar_config: avatar, avatar_url: null, avatar_type: 'builder' } : {}),
        } as Partial<Profile>);
        setProfileSaving(false);
      }
    }

    if (step === steps.length - 1) {
      setShowUpgrade(true);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const handlePrev = () => setStep((s) => Math.max(0, s - 1));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <TrackLoader size={32} />
      </div>
    );
  }

  return (
    <>
      <StepperShell
        steps={steps}
        current={step}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={() => void finish(true)}
        // Handle and avatar are part of signing up, so that step cannot be
        // skipped (Continue keeps the assigned ones). Nor can the passkey step
        // when it is how this account signs in.
        showSkip={
          step < steps.length - 1 &&
          stepId !== 'profile' &&
          !(stepId === 'passkey' && passkeyFirst && !hasPasskey && !passwordFallback)
        }
        // Blocks double-submit while the profile step writes.
        canGoNext={
          !profileSaving &&
          !(stepId === 'passkey' && passkeyFirst && !hasPasskey && !passwordFallback)
        }
        nextLabel={
          step === steps.length - 1
            ? t('onboarding.finish', 'Enter Queer Guide')
            : t('onboarding.continue', 'Continue')
        }
        variant="celebrate"
      >
        {stepId === 'profile' && (
          <div className="max-w-xl">
            <div className="mb-8">
              <h1 className="text-headline font-bold tracking-tight mb-2">
                {t('onboarding.welcome', 'Welcome to Queer Guide')}
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {t(
                  'onboarding.profileBlurb',
                  'Choose your username and picture. We suggested a handle and an avatar to start from.',
                )}
              </p>
            </div>
            <ProfileSetupStep
              username={username}
              onUsernameChange={setUsernameOverride}
              avatar={avatar}
              onAvatarChange={setAvatarOverride}
            />
          </div>
        )}

        {stepId === 'passkey' && (
          <div className="max-w-xl">
            <h1 className="mb-2 text-headline font-bold tracking-tight">
              {t('onboarding.passkeyHeading', 'Sign in with a passkey')}
            </h1>
            <p className="mb-6 leading-relaxed text-muted-foreground">
              {passkeyFirst
                ? t(
                    'onboarding.passkeyRequiredBlurb',
                    'This is how you sign in to your new account. It takes a few seconds.',
                  )
                : t(
                    'onboarding.passkeyBlurb',
                    'Sign in faster and more securely with your device. No passwords to remember.',
                  )}
            </p>

            <div className="rounded-container bg-card p-6 shadow-soft">
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {[
                  {
                    Icon: Fingerprint,
                    text: t(
                      'onboarding.passkeyWhy1',
                      'Sign in with your face, fingerprint or device PIN',
                    ),
                  },
                  {
                    Icon: Lock,
                    text: t(
                      'onboarding.passkeyWhy2',
                      'Nothing to remember, nothing to phish or leak',
                    ),
                  },
                  {
                    Icon: Smartphone,
                    text: t(
                      'onboarding.passkeyWhy3',
                      'Syncs across your devices with your password manager',
                    ),
                  },
                ].map(({ Icon, text }) => (
                  <li key={text} className="flex items-center gap-4 text-15">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>

              {enrollErr && (
                <Alert variant="destructive" className="mt-6">
                  <AlertDescription>
                    {enrollErr}
                    {passkeyFirst && !passwordFallback && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setPasswordFallback(true)}
                        >
                          {t('onboarding.passkeyFallback', 'Set a password instead')}
                        </button>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {passwordFallback && (
                <div className="mt-6">
                  <ChangePasswordPanel />
                </div>
              )}

              <Button
                type="button"
                size="lg"
                variant={hasPasskey ? 'outline' : 'default'}
                onClick={handleEnrollPasskey}
                disabled={enrolling || hasPasskey}
                className="mt-6 w-full"
              >
                {enrolling ? (
                  <TrackLoader size={16} />
                ) : hasPasskey ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden />
                )}
                {hasPasskey
                  ? t('onboarding.passkeyAlreadyEnrolled', 'Passkey already enabled')
                  : t('onboarding.passkeyEnable', 'Enable passkey')}
              </Button>
            </div>
          </div>
        )}

        {stepId === 'personalize' && (
          <div className="max-w-xl">
            <h1 className="text-headline font-bold tracking-tight mb-2">
              {t('onboarding.personalizeTitle', 'Personalize your discovery')}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t(
                'onboarding.personalizeBlurb',
                'Pick vibes, home city, and languages so search results learn what you like. You can do this later.',
              )}
            </p>
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => navigate('/onboarding/search')}>
                {t('onboarding.openPersonalization', 'Open personalization')}
              </Button>
            </div>
          </div>
        )}

        {stepId === 'trust' && (
          <div className="max-w-xl">
            <ShieldCheck size={40} className="mb-4 text-foreground" />
            <h1 className="text-headline font-bold tracking-tight mb-2">
              {t('onboarding.trustTitle', 'Trust grows with you')}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t(
                'onboarding.trustBlurb',
                'Everyone starts as a Visitor. Verify your email, complete your profile, and contribute to earn Explorer, Resident, and finally Guardian — each tier opens more of the community.',
              )}
            </p>
            <div className="space-y-4 text-sm">
              {['Visitor', 'Explorer', 'Resident', 'Guardian'].map((tier, i) => (
                <div key={tier} className="flex items-center gap-4 pt-4">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold bg-surface-container">
                    {i + 1}
                  </span>
                  <span className="font-medium">{tier}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </StepperShell>

      <TierUpgradeOverlay
        open={showUpgrade}
        tierName={t('onboarding.tierVisitor', 'Visitor')}
        tagline={t(
          'onboarding.tierVisitorTagline',
          "You've joined Queer Guide. Welcome to the community.",
        )}
        icon={<Heart size={42} style={{ fill: 'currentcolor' }} />}
        onDismiss={() => void finish(false)}
      />
    </>
  );
}
