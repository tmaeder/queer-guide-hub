import React, { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSecureTurnstile } from '@/hooks/useSecureTurnstile';
import { Loader2, Shield } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
            <Typography component="span">Loading security verification...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error || !isConfigured) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ width: 20, height: 20 }} />
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
              sx={{ mt: 1.5 }}
            >
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box className={className}>
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
        <Alert sx={{ mt: 1 }}>
          <AlertDescription sx={{ fontSize: '0.875rem', color: 'error.main' }}>
            {verificationError}
          </AlertDescription>
        </Alert>
      )}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Security verification v{config.version}
        </Typography>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshConfig}
          sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
        >
          Refresh
        </Button>
      </Box>
    </Box>
  );
}
