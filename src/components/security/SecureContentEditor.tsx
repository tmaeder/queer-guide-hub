import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, CheckCircle, Clock } from 'lucide-react';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecureContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  contentType?: 'post' | 'comment' | 'bio' | 'general';
  maxLength?: number;
  required?: boolean;
  className?: string;
}

export function SecureContentEditor({
  value,
  onChange,
  label = "Content",
  placeholder = "Enter your content...",
  contentType = 'general',
  maxLength,
  required = false,
  className = ""
}: SecureContentEditorProps) {
  const [validation, setValidation] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { validateContent } = useSecurityValidation();

  useEffect(() => {
    if (!value || value.trim().length === 0) {
      setValidation(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidating(true);
      const result = await validateContent(value, contentType);
      setValidation(result);
      setIsValidating(false);
    }, 1000); // Debounce validation

    return () => clearTimeout(timeoutId);
  }, [value, contentType, validateContent]);

  const getContentLimits = () => {
    if (maxLength) return maxLength;
    
    switch (contentType) {
      case 'post': return 10000;
      case 'comment': return 2000;
      case 'bio': return 500;
      default: return 5000;
    }
  };

  const currentLength = value.length;
  const limit = getContentLimits();
  const isNearLimit = currentLength > limit * 0.8;
  const isOverLimit = currentLength > limit;

  const getValidationStatus = () => {
    if (isValidating) return { icon: Clock, color: 'text-muted-foreground', text: 'Validating...' };
    if (!validation) return null;
    if (validation.is_valid) return { icon: CheckCircle, color: 'text-success', text: 'Content approved' };
    if (validation.security_level === 'high') return { icon: AlertTriangle, color: 'text-destructive', text: 'Security violation detected' };
    return { icon: AlertTriangle, color: 'text-warning', text: 'Content needs review' };
  };

  const status = getValidationStatus();

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'text-muted-foreground': return 'var(--muted-foreground)';
      case 'text-success': return 'var(--success, #22c55e)';
      case 'text-destructive': return 'var(--destructive)';
      case 'text-warning': return 'var(--warning, #eab308)';
      default: return undefined;
    }
  };

  return (
    <Box className={className} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label htmlFor="content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield style={{ height: 16, width: 16 }} />
          {label}
          {required && <Typography component="span" sx={{ color: 'error.main' }}>*</Typography>}
        </Label>

        {status && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <status.icon style={{ height: 16, width: 16, color: getStatusColor(status.color) }} />
            <Typography component="span" sx={{ fontSize: '0.875rem', color: getStatusColor(status.color) }}>{status.text}</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ position: 'relative' }}>
        <Textarea
          id="content"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          style={{
            minHeight: 100,
            resize: 'vertical',
            ...((validation && !validation.is_valid) || isOverLimit ? { borderColor: 'var(--destructive)' } : {})
          }}
        />

        <Box sx={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}>
            {currentLength}/{limit}
          </Badge>
        </Box>
      </Box>

      {validation && validation.errors && validation.errors.length > 0 && (
        <Alert variant={validation.security_level === 'high' ? 'destructive' : 'default'}>
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            <Box component="ul" sx={{ listStyleType: 'disc', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {validation.errors.map((error: string, index: number) => (
                <li key={index}>{error}</li>
              ))}
            </Box>
          </AlertDescription>
        </Alert>
      )}

      {isOverLimit && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            Content exceeds the maximum length of {limit} characters for {contentType} content.
          </AlertDescription>
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
        <Typography component="span" sx={{ fontSize: 'inherit', color: 'inherit' }}>Content is automatically scanned for security issues</Typography>
        {validation && (
          <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
            Security Level: {validation.security_level || 'unknown'}
          </Badge>
        )}
      </Box>
    </Box>
  );
}