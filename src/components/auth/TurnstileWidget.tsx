import React, { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSecureTurnstile } from '@/hooks/useSecureTurnstile';
import { Loader2, Shield } from 'lucide-react';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: (error: any) => void;
  action?: string;
  className?: string;
}

export function TurnstileWidget({ onVerify, onError, action = 'login', className }: TurnstileWidgetProps) {
  const { config, loading, error, refreshConfig, isConfigured } = useSecureTurnstile();
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleVerificationSuccess = (token: string) => {
    console.log('Turnstile verification successful');
    setVerificationError(null);
    onVerify(token);
  };

  const handleVerificationError = (error: any) => {
    console.error('Turnstile verification error:', error);
    setVerificationError('Verification failed. Please try again.');
    onError?.(error);
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading security verification...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !isConfigured) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Verification Unavailable
          </CardTitle>
          <CardDescription>
            {error || 'Captcha verification is not configured.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Security verification is currently unavailable. Please contact support if this issue persists.
            </AlertDescription>
          </Alert>
          {error?.includes('Rate limit') && (
            <Button 
              variant="outline" 
              onClick={refreshConfig}
              className="mt-3"
            >
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Turnstile
        siteKey={config.siteKey}
        onSuccess={handleVerificationSuccess}
        onError={handleVerificationError}
        options={{
          action: action,
          theme: 'light',
          size: 'normal',
        }}
      />
      {verificationError && (
        <Alert className="mt-2">
          <AlertDescription className="text-sm text-destructive">
            {verificationError}
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          Security verification v{config.version}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshConfig}
          className="text-xs text-muted-foreground"
        >
          Refresh
        </Button>
      </div>
    </div>
  );
}