import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTranslation } from 'react-i18next';

interface Props {
  email: string;
  onBackToLogin: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationScreen({ email, onBackToLogin }: Props) {
  const { resendVerification, user } = useAuth();
  const navigate = useLocalizedNavigate();
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
    <Card>
      <CardHeader>
        <div className="flex justify-center mb-4">
          <Mail size={48} color="hsl(var(--primary))" />
        </div>
        <CardTitle>{t('auth.verifyEmail.title', 'Check your email')}</CardTitle>
        <CardDescription>
          {t('auth.verifyEmail.description', 'We sent a verification link to')} <strong>{email}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-center">
            {t(
              'auth.verifyEmail.instructions',
              'Click the link in the email to activate your account. The link expires in 24 hours.'
            )}
          </p>

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

          >
            {status === 'sending' && (
              <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
            )}
            {cooldown > 0
              ? t('auth.verifyEmail.resendIn', { defaultValue: 'Resend in {{seconds}}s', seconds: cooldown })
              : t('auth.verifyEmail.resend', 'Resend verification email')}
          </Button>

          {user ? (
            <Button type="button" onClick={() => navigate('/')}>
              {t('auth.verifyEmail.continue', 'Continue to The Queer Guide')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onBackToLogin}>
              {t('auth.verifyEmail.backToLogin', 'Back to sign in')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
