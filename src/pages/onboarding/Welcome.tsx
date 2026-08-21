import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, KeyRound, ShieldCheck, Check } from 'lucide-react';
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

  const steps: StepperStep[] = useMemo(
    () => [
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
    ],
    [t],
  );

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
        showSkip={step < steps.length - 1}
        // Blocks double-submit while the profile step writes.
        canGoNext={!profileSaving}
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
              <Heart size={40} className="mb-4 text-foreground" style={{ fill: 'currentcolor' }} />
              <h1 className="text-headline font-bold tracking-tight mb-2">
                {t('onboarding.welcome', 'Welcome to Queer Guide')}
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {t(
                  'onboarding.profileBlurb',
                  'Your account is ready. We gave you a handle and an avatar. Keep them or make them yours.',
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
            <div className="mb-8">
              <Heart size={40} className="mb-4 text-foreground" style={{ fill: 'currentcolor' }} />
              <h1 className="text-headline font-bold tracking-tight mb-2">
                {t('onboarding.welcome', 'Welcome to Queer Guide')}
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {t(
                  'onboarding.welcomeBlurb',
                  "You're in. A few quick optional steps to make it yours.",
                )}
              </p>
            </div>

            <div className="pt-8">
              <div className="flex items-center gap-4 mb-4">
                <KeyRound size={20} />
                <p className="text-base font-semibold">
                  {t('onboarding.passkeyTitle', 'Set up a passkey')}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                {t(
                  'onboarding.passkeyBlurb',
                  'Sign in faster and more securely with your device. No passwords to remember.',
                )}
              </p>
              {enrollErr && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{enrollErr}</AlertDescription>
                </Alert>
              )}
              <Button
                type="button"
                variant={hasPasskey ? 'outline' : 'default'}
                onClick={handleEnrollPasskey}
                disabled={enrolling || hasPasskey}
              >
                {enrolling && <TrackLoader size={16} className="mr-2" />}
                {hasPasskey && <Check className="mr-2 h-4 w-4" />}
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
