import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

/**
 * Gate write actions (contributions, messaging) behind a verified email.
 * Returns a `require` function that returns true if the user is verified,
 * otherwise shows a toast and returns false. Use as:
 *   const requireVerified = useRequireVerifiedEmail();
 *   const onSubmit = () => { if (!requireVerified()) return; ... }
 */
export function useRequireVerifiedEmail() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useCallback((): boolean => {
    if (!user) {
      toast({
        title: t('auth.required.title', 'Sign in required'),
        description: t('auth.required.description', 'Please sign in to continue.'),
        variant: 'destructive',
      });
      return false;
    }
    if (!user.email_confirmed_at) {
      toast({
        title: t('auth.verifyEmail.gateTitle', 'Verify your email first'),
        description: t(
          'auth.verifyEmail.gateDescription',
          'Confirm your email to contribute or message other members.',
        ),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }, [user, toast, t]);
}
