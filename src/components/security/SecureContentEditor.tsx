import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, CheckCircle, Clock } from 'lucide-react';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { cn } from '@/lib/utils';

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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor="content" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
        
        {status && (
          <div className="flex items-center gap-1">
            <status.icon className={cn("h-4 w-4", status.color)} />
            <span className={cn("text-sm", status.color)}>{status.text}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <Textarea
          id="content"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cn(
            "min-h-[100px] resize-vertical",
            validation && !validation.is_valid && "border-destructive focus:border-destructive",
            isOverLimit && "border-destructive focus:border-destructive"
          )}
        />
        
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}>
            {currentLength}/{limit}
          </Badge>
        </div>
      </div>

      {validation && validation.errors && validation.errors.length > 0 && (
        <Alert variant={validation.security_level === 'high' ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validation.errors.map((error: string, index: number) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {isOverLimit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Content exceeds the maximum length of {limit} characters for {contentType} content.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Content is automatically scanned for security issues</span>
        {validation && (
          <Badge variant="outline" className="text-xs">
            Security Level: {validation.security_level || 'unknown'}
          </Badge>
        )}
      </div>
    </div>
  );
}