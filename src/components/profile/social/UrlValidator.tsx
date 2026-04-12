import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    } catch (_error) {
      setValidationState('invalid');
      setValidationDetails('Failed to validate URL');
      onValidate?.(url, false);
    }
  };

  if (!url.trim()) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleValidation}
        disabled={validationState === 'validating'}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {validationState === 'validating' ? (
            <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
          ) : (
            <Shield style={{ width: 12, height: 12 }} />
          )}
          Validate
        </Box>
      </Button>

      {validationState === 'valid' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#16a34a' }}>
          <CheckCircle style={{ width: 16, height: 16 }} />
          <Typography variant="body2">Valid</Typography>
        </Box>
      )}

      {validationState === 'invalid' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#dc2626' }}>
          <XCircle style={{ width: 16, height: 16 }} />
          <Typography variant="body2">Invalid</Typography>
        </Box>
      )}

      {validationDetails && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{validationDetails}</Typography>
      )}
    </Box>
  );
}
