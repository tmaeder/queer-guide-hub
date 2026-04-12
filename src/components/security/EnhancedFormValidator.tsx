import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useContentValidation } from './EnhancedContentValidator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';

interface EnhancedFormValidatorProps {
  children: React.ReactNode;
  contentFields?: string[];
  maxAttempts?: number;
  timeWindow?: number;
  onValidationError?: (errors: string[]) => void;
}

export function EnhancedFormValidator({
  children,
  contentFields = ['content', 'description', 'bio', 'message'],
  maxAttempts = 10,
  timeWindow = 60,
  onValidationError
}: EnhancedFormValidatorProps) {
  const { user } = useAuth();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const { validateContent } = useContentValidation();

  const validateForm = async (formData: FormData | Record<string, unknown>) => {
    const errors: string[] = [];
    const isFormData = formData instanceof FormData;

    // Clear previous errors
    setValidationErrors([]);

    try {
      // Rate limiting check
      const rateLimitKey = `form_validation_${user?.id || 'anonymous'}`;
      const attempts = parseInt(sessionStorage.getItem(rateLimitKey) || '0');
      const lastAttempt = parseInt(sessionStorage.getItem(`${rateLimitKey}_time`) || '0');
      const now = Date.now();

      if (now - lastAttempt < timeWindow * 1000 && attempts >= maxAttempts) {
        setIsBlocked(true);
        errors.push('Too many validation attempts. Please wait before trying again.');
        setValidationErrors(errors);
        onValidationError?.(errors);
        return false;
      }

      // Update attempt counter
      if (now - lastAttempt >= timeWindow * 1000) {
        sessionStorage.setItem(rateLimitKey, '1');
      } else {
        sessionStorage.setItem(rateLimitKey, (attempts + 1).toString());
      }
      sessionStorage.setItem(`${rateLimitKey}_time`, now.toString());

      // Validate content fields
      for (const fieldName of contentFields) {
        const value = isFormData ? formData.get(fieldName) : formData[fieldName];

        if (value && typeof value === 'string') {
          const result = await validateContent(value, user?.id);

          if (!result.isValid) {
            errors.push(...result.errors.map(error => `${fieldName}: ${error}`));
          }
        }
      }

      // Additional client-side validations
      const emailField = isFormData ? formData.get('email') : formData['email'];
      if (emailField && typeof emailField === 'string') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(emailField)) {
          errors.push('Invalid email format');
        }
      }

      // URL validation
      const urlFields = ['website', 'url', 'link_url'];
      for (const fieldName of urlFields) {
        const value = isFormData ? formData.get(fieldName) : formData[fieldName];
        if (value && typeof value === 'string') {
          try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
              errors.push(`${fieldName}: Only HTTP and HTTPS URLs are allowed`);
            }
          } catch {
            errors.push(`${fieldName}: Invalid URL format`);
          }
        }
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        onValidationError?.(errors);
        return false;
      }

      setIsBlocked(false);
      return true;

    } catch (error) {
      console.error('Form validation error:', error);
      errors.push('Validation failed. Please try again.');
      setValidationErrors(errors);
      onValidationError?.(errors);
      return false;
    }
  };

  // Enhanced form wrapper with validation
  const enhancedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === 'form') {
      return React.cloneElement(child, {
        onSubmit: async (e: React.FormEvent) => {
          e.preventDefault();

          if (isBlocked) {
            return;
          }

          const form = e.target as HTMLFormElement;
          const formData = new FormData(form);

          const isValid = await validateForm(formData);

          if (isValid && child.props.onSubmit) {
            child.props.onSubmit(e);
          }
        }
      } as React.HTMLAttributes<HTMLFormElement>);
    }
    return child;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {(validationErrors.length > 0 || isBlocked) && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            {isBlocked ? (
              <span>Form submission blocked due to too many invalid attempts. Please wait and try again.</span>
            ) : (
              <div>
                <span>Please fix the following issues:</span>
                <Box component="ul" sx={{ listStyle: 'disc', listStylePosition: 'inside', mt: 1 }}>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </Box>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {enhancedChildren}
    </Box>
  );
}

// Hook for imperative form validation
export function useFormValidation() {
  const { user } = useAuth();
  const { validateContent } = useContentValidation();

  const validateFormData = async (data: Record<string, unknown>, contentFields: string[] = ['content']) => {
    const errors: string[] = [];

    for (const fieldName of contentFields) {
      const value = data[fieldName];
      if (value && typeof value === 'string') {
        const result = await validateContent(value, user?.id);
        if (!result.isValid) {
          errors.push(...result.errors.map(error => `${fieldName}: ${error}`));
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  return {
    validateFormData
  };
}
