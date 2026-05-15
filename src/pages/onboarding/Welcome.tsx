import { useEffect, useMemo, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Loader2, KeyRound, ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { StepperShell, type StepperStep } from '@/components/ui/StepperShell';
import { TierUpgradeOverlay } from '@/components/ui/TierUpgradeOverlay';

export default function Welcome() {
  const navigate = useLocalizedNavigate();
  const { user, loading, hasPasskey, enrollPasskey } = useAuth();
  const { emit } = useSignupFunnel();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [enrolling, setEnrolling] = useState(false);
  const [enrollErr, setEnrollErr] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

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
        description: t(
          'onboarding.steps.personalizeDesc',
          'Tell us what you want to discover.',
        ),
      },
      {
        id: 'trust',
        label: t('onboarding.steps.trust', 'Trust tier'),
        description: t(
          'onboarding.steps.trustDesc',
          'Your community standing begins here.',
        ),
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

  const finish = (skipped: boolean) => {
    emit(skipped ? 'onboarding_skipped' : 'onboarding_completed');
    setShowUpgrade(false);
    navigate('/', { replace: true });
  };

  const handleNext = () => {
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
        <Loader2 className="h-8 w-8 animate-spin" />
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
        onSkip={() => finish(true)}
        showSkip={step < steps.length - 1}
        nextLabel={
          step === steps.length - 1
            ? t('onboarding.finish', 'Enter The Queer Guide')
            : t('onboarding.continue', 'Continue')
        }
        variant="celebrate"
      >
        {step === 0 && (
          <div className="max-w-xl">
            <div className="mb-8">
              <Heart
                size={40}
                className="mb-4 text-foreground"
                style={{ fill: 'currentcolor' }}
              />
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {t('onboarding.welcome', 'Welcome to The Queer Guide')}
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {t(
                  'onboarding.welcomeBlurb',
                  "You're in. A few quick optional steps to make it yours.",
                )}
              </p>
            </div>

            <div className="border-t border-border pt-8">
              <div className="flex items-center gap-3 mb-3">
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
                {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {hasPasskey && <Check className="mr-2 h-4 w-4" />}
                {hasPasskey
                  ? t(
                      'onboarding.passkeyAlreadyEnrolled',
                      'Passkey already enabled',
                    )
                  : t('onboarding.passkeyEnable', 'Enable passkey')}
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-xl">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {t('onboarding.personalizeTitle', 'Personalize your discovery')}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t(
                'onboarding.personalizeBlurb',
                'Pick vibes, home city, and languages so search results learn what you like. You can do this later.',
              )}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/onboarding/search')}
              >
                {t('onboarding.openPersonalization', 'Open personalization')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl">
            <ShieldCheck size={40} className="mb-4 text-foreground" />
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {t('onboarding.trustTitle', 'Trust grows with you')}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t(
                'onboarding.trustBlurb',
                'Everyone starts as a Visitor. Verify your email, complete your profile, and contribute to unlock Explorer, Resident, and finally Guardian — each tier opens more of the community.',
              )}
            </p>
            <div className="space-y-3 text-sm">
              {['Visitor', 'Explorer', 'Resident', 'Guardian'].map(
                (tier, i) => (
                  <div
                    key={tier}
                    className="flex items-center gap-3 border-t border-border pt-3"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="font-medium">{tier}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </StepperShell>

      <TierUpgradeOverlay
        open={showUpgrade}
        tierName={t('onboarding.tierVisitor', 'Visitor')}
        tagline={t(
          'onboarding.tierVisitorTagline',
          "You've joined The Queer Guide. Welcome to the community.",
        )}
        icon={<Heart size={42} style={{ fill: 'currentcolor' }} />}
        onDismiss={() => finish(false)}
      />
    </>
  );
}
