import React, { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink } from 'lucide-react';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: (error: any) => void;
  action?: string;
  className?: string;
}

export function TurnstileWidget({ onVerify, onError, action = 'login', className }: TurnstileWidgetProps) {
  const [siteKey, setSiteKey] = useState(localStorage.getItem('turnstile_site_key') || '');
  const [showSiteKeyInput, setShowSiteKeyInput] = useState(!siteKey);
  const [isConfiguring, setIsConfiguring] = useState(false);

  const handleSiteKeySubmit = () => {
    if (siteKey.trim()) {
      localStorage.setItem('turnstile_site_key', siteKey.trim());
      setShowSiteKeyInput(false);
      setIsConfiguring(false);
    }
  };

  const handleVerificationSuccess = (token: string) => {
    console.log('Turnstile verification successful');
    onVerify(token);
  };

  const handleVerificationError = (error: any) => {
    console.error('Turnstile verification error:', error);
    onError?.(error);
  };

  if (showSiteKeyInput || !siteKey) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🔒</span>
            Turnstile Configuration Required
          </CardTitle>
          <CardDescription>
            Please enter your Cloudflare Turnstile Site Key to enable captcha verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Get your free Turnstile Site Key from{' '}
              <a 
                href="https://dash.cloudflare.com/profile/api-tokens" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Cloudflare Dashboard
                <ExternalLink className="h-3 w-3" />
              </a>
            </AlertDescription>
          </Alert>
          
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="0x4AAAAAAABkMYinukNVyZ8-"
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleSiteKeySubmit} 
                disabled={!siteKey.trim()}
                className="flex-1"
              >
                Save Site Key
              </Button>
              {!isConfiguring && (
                <Button 
                  variant="ghost" 
                  onClick={() => setIsConfiguring(true)}
                >
                  Skip for now
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Turnstile
        siteKey={siteKey}
        onSuccess={handleVerificationSuccess}
        onError={handleVerificationError}
        options={{
          action: action,
          theme: 'light',
          size: 'normal',
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSiteKeyInput(true)}
          className="text-xs text-muted-foreground"
        >
          Update Site Key
        </Button>
      </div>
    </div>
  );
}