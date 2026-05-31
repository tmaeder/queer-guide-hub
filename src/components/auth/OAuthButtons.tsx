import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { useTranslation } from 'react-i18next';

interface Props {
  onError?: (msg: string) => void;
}

// Google is intentionally not offered: the provider is not enabled in Supabase
// Auth, so the button would only ever error ("provider is not enabled").
// Re-add it here once the Google OAuth client is configured in the dashboard.
export function OAuthButtons({ onError }: Props) {
  const { signInWithOAuth } = useAuth();
  const { emit } = useSignupFunnel();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    emit('oauth_start', { provider: 'apple' });
    const { error } = await signInWithOAuth('apple');
    if (error) {
      setLoading(false);
      onError?.(error.message ?? t('auth.errors.oauthFailed', 'Sign-in failed. Please try again.'));
      emit('step_validation_error', { provider: 'apple', metadata: { error: error.message } });
    }
    // success → browser redirects to provider; no further action here
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        onClick={handle}
        disabled={loading}
      >
        {loading ? (
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} className="mr-2" />
        ) : (
          <AppleIcon />
        )}
        {t('auth.oauth.apple', 'Continue with Apple')}
      </Button>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className="mr-2"
      aria-hidden
      fill="currentColor"
    >
      <path d="M17.05 12.04c-.03-3.07 2.51-4.55 2.62-4.62-1.43-2.09-3.66-2.38-4.45-2.41-1.89-.19-3.69 1.11-4.65 1.11-.97 0-2.45-1.09-4.03-1.06-2.07.03-3.99 1.21-5.06 3.06-2.16 3.74-.55 9.28 1.55 12.32 1.03 1.49 2.25 3.16 3.85 3.1 1.55-.06 2.13-1 4-1 1.86 0 2.39 1 4.02.97 1.66-.03 2.71-1.51 3.72-3.01 1.18-1.72 1.66-3.39 1.69-3.48-.04-.02-3.24-1.24-3.27-4.93zM14.05 3.41c.86-1.04 1.43-2.49 1.27-3.93-1.23.05-2.71.82-3.59 1.86-.79.92-1.49 2.4-1.3 3.81 1.37.11 2.77-.7 3.62-1.74z" />
    </svg>
  );
}
