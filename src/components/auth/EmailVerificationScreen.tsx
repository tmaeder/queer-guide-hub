import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

interface Props {
  email: string;
  onBackToLogin: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationScreen({ email, onBackToLogin }: Props) {
  const { resendVerification } = useAuth();
  const { t } = useTranslation();
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');
    const { error } = await resendVerification(email);
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  };

  return (
    <Card sx={{ maxWidth: 480, mx: 'auto' }}>
      <CardHeader sx={{ textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Mail size={48} color="var(--mui-palette-primary-main)" />
        </Box>
        <CardTitle>{t('auth.verifyEmail.title', 'Check your email')}</CardTitle>
        <CardDescription>
          {t('auth.verifyEmail.description', 'We sent a verification link to')} <strong>{email}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {t(
              'auth.verifyEmail.instructions',
              'Click the link in the email to activate your account. The link expires in 24 hours.'
            )}
          </Typography>

          {status === 'sent' && (
            <Alert>
              <CheckCircle2 style={{ width: 16, height: 16 }} />
              <AlertDescription>
                {t('auth.verifyEmail.resent', 'Verification email sent. Please check your inbox.')}
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={cooldown > 0 || status === 'sending'}
            sx={{ width: '100%' }}
          >
            {status === 'sending' && (
              <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
            )}
            {cooldown > 0
              ? t('auth.verifyEmail.resendIn', { defaultValue: 'Resend in {{seconds}}s', seconds: cooldown })
              : t('auth.verifyEmail.resend', 'Resend verification email')}
          </Button>

          <Button type="button" variant="ghost" onClick={onBackToLogin} sx={{ width: '100%' }}>
            {t('auth.verifyEmail.backToLogin', 'Back to sign in')}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
