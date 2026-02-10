import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
      // Basic client-side URL validation (no external API call with hardcoded keys)
      const parsed = new URL(urlToValidate);
      // Block known dangerous protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      return true;
    } catch {
      return false;
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
      setValidationDetails(isValid ? 'URL format is valid' : 'URL appears to be invalid');

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
          <span className="text-sm">Valid</span>
        </div>
      )}

      {validationState === 'invalid' && (
        <div className="flex items-center gap-1 text-red-600">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Invalid</span>
        </div>
      )}

      {validationDetails && (
        <span className="text-xs text-muted-foreground">{validationDetails}</span>
      )}
    </div>
  );
}
