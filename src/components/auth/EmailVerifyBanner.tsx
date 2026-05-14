import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Mail, Loader2 } from 'lucide-react';

/**
 * Persistent banner shown to users with a session but no verified email.
 * Non-blocking: users can browse. Write actions gated by `useRequireVerifiedEmail`.
 */
export function EmailVerifyBanner() {
  const { user, resendVerification } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!user || user.email_confirmed_at) return null;

  const handleResend = async () => {
    if (!user.email || status === 'sending') return;
    setStatus('sending');
    const { error } = await resendVerification(user.email);
    setStatus(error ? 'error' : 'sent');
  };

  return (
    <div
      role="status"
      className="relative z-10 border-b border-border bg-muted/60 text-sm"
    >
      <div className="container mx-auto px-4 py-2 flex flex-wrap items-center gap-3">
        <Mail className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="flex-1 min-w-0">
          {status === 'sent'
            ? t('auth.verifyEmail.bannerSent', 'Verification email sent. Check your inbox.')
            : t('auth.verifyEmail.banner', 'Verify your email to unlock contributions and messaging.')}
        </span>
        {status !== 'sent' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={status === 'sending'}
          >
            {status === 'sending' && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            {t('auth.verifyEmail.resendShort', 'Resend')}
          </Button>
        )}
      </div>
    </div>
  );
}
