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
      const parsed = new URL(urlToValidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
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
    } catch (_error) {
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
      >
        <span className="flex items-center gap-2">
          {validationState === 'validating' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Shield className="w-3 h-3" />
          )}
          Validate
        </span>
      </Button>

      {validationState === 'valid' && (
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Valid</span>
        </span>
      )}

      {validationState === 'invalid' && (
        <span className="flex items-center gap-1 text-red-600">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">Invalid</span>
        </span>
      )}

      {validationDetails && (
        <span className="text-xs text-muted-foreground">{validationDetails}</span>
      )}
    </div>
  );
}
