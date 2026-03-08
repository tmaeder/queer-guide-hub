import React from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ContentValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedContent?: string;
}

export class EnhancedContentValidator {
  private static readonly MAX_CONTENT_LENGTH = 10000;
  private static readonly SUSPICIOUS_PATTERNS = [
    /javascript:/gi,
    /data:(?!image\/(png|jpg|jpeg|gif|webp|svg\+xml))/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /<script[^>]*>/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<form[^>]*>/gi,
    /document\.cookie/gi,
    /localStorage/gi,
    /sessionStorage/gi,
    /eval\s*\(/gi,
    /function\s*\(/gi,
    /alert\s*\(/gi,
    /confirm\s*\(/gi,
    /prompt\s*\(/gi,
  ];

  private static readonly SQL_INJECTION_PATTERNS = [
    /union\s+select/gi,
    /insert\s+into/gi,
    /delete\s+from/gi,
    /drop\s+table/gi,
    /exec\s*\(/gi,
    /execute\s*\(/gi,
    /\bor\s+1\s*=\s*1\b/gi,
    /\band\s+1\s*=\s*1\b/gi,
    /--/g,
    /\/\*/g,
    /\*\//g,
  ];

  private static async rateLimitCheck(userId: string, action: string): Promise<boolean> {
    try {
      const { data } = await supabase.rpc('check_rate_limit_enhanced', {
        identifier: userId,
        max_attempts: 20,
        time_window_minutes: 60,
        action_type: action,
      });
      return data === true;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      return false;
    }
  }

  private static async logSecurityEvent(
    eventType: string,
    metadata: Record<string, any>,
    severity: string,
    userId?: string,
  ) {
    try {
      await supabase.rpc('log_security_event', {
        p_event_type: eventType,
        p_user_id: userId || '',
        p_metadata: metadata,
        p_severity: severity,
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  static async validateContent(
    content: string,
    userId?: string,
    contentType = 'general',
  ): Promise<ContentValidationResult> {
    const errors: string[] = [];

    // Rate limiting
    if (userId) {
      const rateLimitOk = await this.rateLimitCheck(userId, `content_validation_${contentType}`);
      if (!rateLimitOk) {
        errors.push('Rate limit exceeded. Please try again later.');
        return { isValid: false, errors };
      }
    }

    // Length validation
    if (!content || content.trim().length === 0) {
      errors.push('Content cannot be empty');
      return { isValid: false, errors };
    }

    if (content.length > this.MAX_CONTENT_LENGTH) {
      errors.push(`Content exceeds maximum length of ${this.MAX_CONTENT_LENGTH} characters`);
    }

    // XSS pattern detection
    const suspiciousMatches = this.SUSPICIOUS_PATTERNS.filter((pattern) => pattern.test(content));
    if (suspiciousMatches.length > 0) {
      errors.push('Potentially malicious content detected');
      await this.logSecurityEvent(
        'XSS_ATTEMPT_DETECTED',
        {
          content_preview: content.substring(0, 100),
          content_type: contentType,
          patterns_matched: suspiciousMatches.length,
        },
        'high',
        userId,
      );
    }

    // SQL injection detection
    const sqlMatches = this.SQL_INJECTION_PATTERNS.filter((pattern) => pattern.test(content));
    if (sqlMatches.length > 0) {
      errors.push('SQL injection attempt detected');
      await this.logSecurityEvent(
        'SQL_INJECTION_ATTEMPT',
        {
          content_preview: content.substring(0, 100),
          content_type: contentType,
          patterns_matched: sqlMatches.length,
        },
        'critical',
        userId,
      );
    }

    // Basic content sanitization (remove null bytes, control characters)
    const sanitizedContent = content
      .replace(/\0/g, '') // Remove null bytes
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();

    // URL validation for links
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlPattern) || [];
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        // Block dangerous protocols
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          errors.push('Invalid URL protocol detected');
          break;
        }
      } catch {
        errors.push('Invalid URL format detected');
        break;
      }
    }

    const isValid = errors.length === 0;

    // Log successful validation for monitoring
    if (isValid && userId) {
      await this.logSecurityEvent(
        'CONTENT_VALIDATED',
        {
          content_type: contentType,
          content_length: content.length,
        },
        'low',
        userId,
      );
    }

    return {
      isValid,
      errors,
      sanitizedContent: isValid ? sanitizedContent : undefined,
    };
  }

  static async validateFileUpload(file: File, userId?: string): Promise<ContentValidationResult> {
    const errors: string[] = [];
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
    ];

    // Rate limiting for file uploads
    if (userId) {
      const rateLimitOk = await this.rateLimitCheck(userId, 'file_upload');
      if (!rateLimitOk) {
        errors.push('File upload rate limit exceeded. Please try again later.');
        return { isValid: false, errors };
      }
    }

    // File size validation
    if (file.size > maxFileSize) {
      errors.push(`File size exceeds maximum of ${maxFileSize / (1024 * 1024)}MB`);
    }

    // File type validation
    if (!allowedTypes.includes(file.type)) {
      errors.push('File type not allowed');
      await this.logSecurityEvent(
        'INVALID_FILE_TYPE_UPLOAD',
        {
          file_type: file.type,
          file_name: file.name,
          file_size: file.size,
        },
        'medium',
        userId,
      );
    }

    // File name validation
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.js', '.vbs', '.jar'];
    const fileExtension = file.name.toLowerCase().split('.').pop();
    if (fileExtension && dangerousExtensions.includes(`.${fileExtension}`)) {
      errors.push('File extension not allowed');
      await this.logSecurityEvent(
        'DANGEROUS_FILE_EXTENSION',
        {
          file_extension: fileExtension,
          file_name: file.name,
        },
        'high',
        userId,
      );
    }

    const isValid = errors.length === 0;

    if (isValid && userId) {
      await this.logSecurityEvent(
        'FILE_UPLOAD_VALIDATED',
        {
          file_type: file.type,
          file_size: file.size,
        },
        'low',
        userId,
      );
    }

    return { isValid, errors };
  }
}

// React hook for content validation
export function useContentValidation() {
  const validateContent = async (content: string, contentType?: string) => {
    return await EnhancedContentValidator.validateContent(content, undefined, contentType);
  };

  const validateFile = async (file: File) => {
    return await EnhancedContentValidator.validateFileUpload(file);
  };

  return { validateContent, validateFile };
}
