import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Loader2, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function Welcome() {
  const navigate = useNavigate();
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
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Card>
          <CardHeader sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Heart size={48} color="var(--mui-palette-primary-main)" style={{ fill: 'currentcolor' }} />
            </Box>
            <CardTitle>{t('onboarding.welcome', 'Welcome to The Queer Guide')}</CardTitle>
            <CardDescription>
              {t('onboarding.welcomeBlurb', "You're in. A few quick optional steps to make it yours.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <KeyRound size={20} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {t('onboarding.passkeyTitle', 'Set up a passkey')}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {t(
                    'onboarding.passkeyBlurb',
                    'Sign in faster and more securely with your device. No passwords to remember.'
                  )}
                </Typography>
                {enrollErr && (
                  <Alert variant="destructive" sx={{ mb: 1.5 }}>
                    <AlertDescription>{enrollErr}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="button"
                  variant={hasPasskey ? 'outline' : 'default'}
                  onClick={handleEnrollPasskey}
                  disabled={enrolling || hasPasskey}
                  sx={{ width: '100%' }}
                >
                  {enrolling && (
                    <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                  )}
                  {hasPasskey
                    ? t('onboarding.passkeyAlreadyEnrolled', 'Passkey already enabled')
                    : t('onboarding.passkeyEnable', 'Enable passkey')}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button onClick={() => finish(false)} sx={{ width: '100%' }}>
                  {t('onboarding.continue', 'Continue to The Queer Guide')}
                </Button>
                <Button variant="ghost" onClick={() => finish(true)} sx={{ width: '100%' }}>
                  {t('onboarding.skip', 'Skip for now')}
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
