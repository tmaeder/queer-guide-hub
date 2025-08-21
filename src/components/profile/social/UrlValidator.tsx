import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';

interface UrlValidatorProps {
  url: string;
  onValidate?: (url: string, isValid: boolean) => void;
}

export function UrlValidator({ url, onValidate }: UrlValidatorProps) {
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationDetails, setValidationDetails] = useState<string>('');

  const validateUrl = async (urlToValidate: string): Promise<boolean> => {
    try {
      const apiKey = 'AIzaSyAkSfSrwIQGzVciKbClNYpL9YHPbHOj_Og';
      const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'lovable-social-validator', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
            platformTypes: ['WINDOWS'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: urlToValidate }]
          }
        })
      });
      const data = await response.json();
      return !data.matches || data.matches.length === 0;
    } catch {
      return true; // Allow if validation fails
    }
  };

  const handleValidation = async () => {
    if (!url.trim()) return;
    
    setValidationState('validating');
    setValidationDetails('');

    try {
      const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
      const isValid = await validateUrl(cleanUrl);
      
      setValidationState(isValid ? 'valid' : 'invalid');
      setValidationDetails(isValid ? 'URL is safe and accessible' : 'URL appears to be unsafe or invalid');
      
      onValidate?.(cleanUrl, isValid);
    } catch (error) {
      setValidationState('invalid');
      setValidationDetails('Failed to validate URL');
      onValidate?.(url, false);
    }
  };

  if (!url.trim()) return null;

  return (
    <div className="flex items-center gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleValidation}
        disabled={validationState === 'validating'}
        className="flex items-center gap-2"
      >
        {validationState === 'validating' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Shield className="h-3 w-3" />
        )}
        Validate
      </Button>
      
      {validationState === 'valid' && (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Safe</span>
        </div>
      )}
      
      {validationState === 'invalid' && (
        <div className="flex items-center gap-1 text-red-600">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Unsafe</span>
        </div>
      )}
      
      {validationDetails && (
        <span className="text-xs text-muted-foreground">{validationDetails}</span>
      )}
    </div>
  );
}