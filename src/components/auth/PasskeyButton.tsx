import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PasskeyButtonProps {
  mode: 'enroll' | 'signin';
  sx?: object;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export const PasskeyButton = ({
  mode,
  sx,
  variant = 'outline'
}: PasskeyButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { enrollPasskey, signInWithPasskey, hasPasskey, user } = useAuth();
  const { toast } = useToast();

  const handlePasskeyAction = async () => {
    setIsLoading(true);

    try {
      if (mode === 'enroll') {
        const { error } = await enrollPasskey();
        if (error) {
          // Log security event for failed passkey enrollment
          if (user) {
            await supabase.rpc('log_security_event', {
              p_event_type: 'PASSKEY_ENROLLMENT_FAILED',
              p_user_id: user.id,
              p_metadata: { error: error.message },
              p_severity: 'medium'
            });
          }
          toast({
            title: "Passkey Setup Failed",
            description: error.message || "Failed to set up passkey. Please try again.",
            variant: "destructive",
          });
        } else {
          // Log successful passkey enrollment
          if (user) {
            await supabase.rpc('log_security_event', {
              p_event_type: 'PASSKEY_ENROLLMENT_SUCCESS',
              p_user_id: user.id,
              p_metadata: { timestamp: new Date().toISOString() },
              p_severity: 'info'
            });
          }
          toast({
            title: "Passkey Setup Complete",
            description: "Your passkey has been successfully set up for passwordless sign-in.",
          });
        }
      } else {
        const { error } = await signInWithPasskey();
        if (error) {
          // Log security event for failed passkey sign-in
          await supabase.rpc('log_security_event', {
            p_event_type: 'PASSKEY_SIGNIN_FAILED',
            p_user_id: null,
            p_metadata: { error: error.message },
            p_severity: 'medium'
          });
          toast({
            title: "Passkey Sign-in Failed",
            description: error.message || "Failed to sign in with passkey. Please try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Passkey Authentication",
            description: "Passkey authentication completed successfully.",
          });
        }
      }
    } catch (_error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show enroll button if passkey is already enrolled
  if (mode === 'enroll' && hasPasskey) {
    return null;
  }

  const buttonText = mode === 'enroll'
    ? 'Set up Passkey'
    : 'Sign in with Passkey';

  const buttonDescription = mode === 'enroll'
    ? 'Enable passwordless sign-in'
    : 'Use your device biometrics';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ...sx }}>
      <Button
        variant={variant}
        onClick={handlePasskeyAction}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
        ) : (
          <Fingerprint style={{ width: 16, height: 16, marginRight: 8 }} />
        )}
        {buttonText}
      </Button>
      <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
        {buttonDescription}
      </Typography>
    </Box>
  );
};
