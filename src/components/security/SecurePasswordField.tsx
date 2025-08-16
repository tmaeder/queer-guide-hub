import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Eye, EyeOff, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { cn } from '@/lib/utils';

interface SecurePasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showStrengthMeter?: boolean;
  autoComplete?: string;
  className?: string;
}

export function SecurePasswordField({
  value,
  onChange,
  label = "Password",
  placeholder = "Enter a secure password",
  required = false,
  showStrengthMeter = true,
  autoComplete = "new-password",
  className = ""
}: SecurePasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { validatePassword } = useSecurityValidation();

  useEffect(() => {
    if (!value || value.length === 0) {
      setValidation(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidating(true);
      const result = await validatePassword(value);
      setValidation(result);
      setIsValidating(false);
    }, 500); // Debounce validation

    return () => clearTimeout(timeoutId);
  }, [value, validatePassword]);

  const getStrengthColor = (level: string) => {
    switch (level) {
      case 'strong': return 'hsl(var(--success))';
      case 'medium': return 'hsl(var(--warning))';
      case 'weak': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  const getStrengthPercentage = (score: number) => {
    return Math.min((score / 7) * 100, 100); // Max score is 7
  };

  const getValidationIcon = () => {
    if (isValidating) return <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />;
    if (!validation) return null;
    if (validation.is_valid) return <CheckCircle className="h-4 w-4 text-success" />;
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="password" className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      
      <div className="relative">
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={cn(
            "pr-20",
            validation && !validation.is_valid && "border-destructive focus:border-destructive"
          )}
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
          {getValidationIcon()}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-1"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {showStrengthMeter && validation && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Password Strength</span>
            <span className={cn(
              "font-medium",
              validation.strength_level === 'strong' && "text-success",
              validation.strength_level === 'medium' && "text-warning",
              validation.strength_level === 'weak' && "text-destructive"
            )}>
              {validation.strength_level?.charAt(0).toUpperCase() + validation.strength_level?.slice(1)}
            </span>
          </div>
          
          <Progress 
            value={getStrengthPercentage(validation.strength_score || 0)}
            className="h-2"
            style={{
              background: 'hsl(var(--muted))',
            }}
          />
        </div>
      )}

      {validation && validation.errors && validation.errors.length > 0 && (
        <div className="space-y-1">
          {validation.errors.map((error: string, index: number) => (
            <p key={index} className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          ))}
        </div>
      )}

      {validation && validation.is_valid && (
        <p className="text-xs text-success flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Password meets security requirements
        </p>
      )}
    </div>
  );
}