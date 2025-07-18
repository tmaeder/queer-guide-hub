import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface PasskeyButtonProps {
  mode: 'enroll' | 'signin';
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export const PasskeyButton = ({ 
  mode, 
  className,
  variant = 'outline'
}: PasskeyButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { enrollPasskey, signInWithPasskey, hasPasskey } = useAuth();
  const { toast } = useToast();

  const handlePasskeyAction = async () => {
    setIsLoading(true);
    
    try {
      if (mode === 'enroll') {
        const { error } = await enrollPasskey();
        if (error) {
          toast({
            title: "Passkey Setup Failed",
            description: error.message || "Failed to set up passkey. Please try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Passkey Setup Complete",
            description: "Your passkey has been successfully set up for passwordless sign-in.",
          });
        }
      } else {
        const { error } = await signInWithPasskey();
        if (error) {
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
    } catch (error) {
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
    <div className="space-y-2">
      <Button
        variant={variant}
        onClick={handlePasskeyAction}
        disabled={isLoading}
        className={className}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        {buttonText}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        {buttonDescription}
      </p>
    </div>
  );
};