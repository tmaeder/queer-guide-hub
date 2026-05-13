import { useEffect, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Loader2, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { BackgroundDots } from '@/components/effects/BackgroundDots';
import { SpotlightEffect } from '@/components/effects/SpotlightEffect';

export default function Welcome() {
  const navigate = useLocalizedNavigate();
  const { user, loading, hasPasskey, enrollPasskey } = useAuth();
  const { emit } = useSignupFunnel();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [enrolling, setEnrolling] = useState(false);
  const [enrollErr, setEnrollErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (user) emit('email_verified', { metadata: { user_id: user.id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

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
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <BackgroundDots className="absolute inset-0 z-0 pointer-events-none" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-mesh opacity-80" />
      <div className="relative z-10 container mx-auto py-16 px-4 max-w-xl">
        <SpotlightEffect className="w-full">
        <Card className="rounded-3xl border-border/80 shadow-xl backdrop-blur-sm bg-background/95">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Heart size={48} className="text-foreground" style={{ fill: 'currentcolor' }} />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-center text-balance">{t('onboarding.welcome', 'Welcome to The Queer Guide')}</CardTitle>
            <CardDescription className="text-center text-base mt-2">
              {t('onboarding.welcomeBlurb', "You're in. A few quick optional steps to make it yours.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <KeyRound size={20} />
                  <p className="text-base font-semibold">
                    {t('onboarding.passkeyTitle', 'Set up a passkey')}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {t(
                    'onboarding.passkeyBlurb',
                    'Sign in faster and more securely with your device. No passwords to remember.'
                  )}
                </p>
                {enrollErr && (
                  <Alert variant="destructive">
                    <AlertDescription>{enrollErr}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="button"
                  variant={hasPasskey ? 'outline' : 'default'}
                  onClick={handleEnrollPasskey}
                  disabled={enrolling || hasPasskey}
                >
                  {enrolling && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {hasPasskey
                    ? t('onboarding.passkeyAlreadyEnrolled', 'Passkey already enabled')
                    : t('onboarding.passkeyEnable', 'Enable passkey')}
                </Button>
              </div>

              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <Button onClick={() => finish(false)}>
                  {t('onboarding.continue', 'Continue to The Queer Guide')}
                </Button>
                <Button variant="ghost" onClick={() => finish(true)}>
                  {t('onboarding.skip', 'Skip for now')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </SpotlightEffect>
      </div>
    </div>
  );
}
