import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  security_level?: string;
  strength_score?: number;
  strength_level?: string;
  file_info?: Record<string, unknown>;
}

interface DatabaseValidationResult {
  is_valid: boolean;
  errors: string[];
  security_level?: string;
  strength_score?: number;
  strength_level?: string;
  file_info?: Record<string, unknown>;
}

export function useSecurityValidation() {
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateContent = useCallback(async (
    content: string,
    contentType: 'post' | 'comment' | 'bio' | 'general' = 'general'
  ): Promise<ValidationResult> => {
    if (!content || content.trim() === '') {
      return {
        is_valid: false,
        errors: ['Content cannot be empty']
      };
    }

    setIsValidating(true);
    
    try {
      const { data, error } = await supabase.rpc('validate_content_security', {
        content_text: content,
        content_type: contentType
      });

      if (error) {
        console.error('Content validation error:', error);
        return {
          is_valid: false,
          errors: ['Validation service unavailable']
        };
      }

      const result = data as unknown as DatabaseValidationResult;
      
      // Show warning for high-risk content
      if (result.security_level === 'high' && !result.is_valid) {
        toast({
          title: "Content Blocked",
          description: "Your content contains potentially harmful elements and cannot be posted.",
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      console.error('Content validation error:', error);
      return {
        is_valid: false,
        errors: ['Validation failed']
      };
    } finally {
      setIsValidating(false);
    }
  }, [toast]);

  const validatePassword = useCallback(async (password: string): Promise<ValidationResult> => {
    if (!password) {
      return {
        is_valid: false,
        errors: ['Password is required']
      };
    }

    setIsValidating(true);
    
    try {
      const { data, error } = await supabase.rpc('validate_password_enhanced', {
        password_text: password
      });

      if (error) {
        console.error('Password validation error:', error);
        return {
          is_valid: false,
          errors: ['Validation service unavailable']
        };
      }

      return data as unknown as ValidationResult;
    } catch (error) {
      console.error('Password validation error:', error);
      return {
        is_valid: false,
        errors: ['Validation failed']
      };
    } finally {
      setIsValidating(false);
    }
  }, []);

  const validateFileUpload = useCallback(async (
    fileName: string,
    fileSize: number,
    mimeType: string
  ): Promise<ValidationResult> => {
    setIsValidating(true);
    
    try {
      const { data, error } = await supabase.rpc('validate_file_upload', {
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType
      });

      if (error) {
        console.error('File validation error:', error);
        return {
          is_valid: false,
          errors: ['Validation service unavailable']
        };
      }

      const result = data as unknown as DatabaseValidationResult;
      
      if (!result.is_valid) {
        toast({
          title: "File Upload Blocked",
          description: "The file you're trying to upload doesn't meet security requirements.",
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      console.error('File validation error:', error);
      return {
        is_valid: false,
        errors: ['Validation failed']
      };
    } finally {
      setIsValidating(false);
    }
  }, [toast]);

  const checkRateLimit = useCallback(async (
    actionType: string = 'general',
    maxAttempts: number = 10,
    timeWindowMinutes: number = 60
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_rate_limit_enhanced', {
        identifier: 'user_action', // Will be replaced with user ID server-side
        max_attempts: maxAttempts,
        time_window_minutes: timeWindowMinutes,
        action_type: actionType
      });

      if (error) {
        console.error('Rate limit check error:', error);
        return true; // Allow action if check fails
      }

      if (!data) {
        toast({
          title: "Rate Limit Exceeded",
          description: "You're performing this action too frequently. Please wait before trying again.",
          variant: "destructive",
        });
      }

      return data;
    } catch (error) {
      console.error('Rate limit check error:', error);
      return true; // Allow action if check fails
    }
  }, [toast]);

  return {
    validateContent,
    validatePassword,
    validateFileUpload,
    checkRateLimit,
    isValidating
  };
}