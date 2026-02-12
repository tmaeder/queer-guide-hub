import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Eye, EyeOff, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';

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
    if (isValidating) return (
      <Box
        sx={{
          height: 16,
          width: 16,
          border: 2,
          borderColor: 'primary.main',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
    );
    if (!validation) return null;
    if (validation.is_valid) return <CheckCircle style={{ height: 16, width: 16, color: 'var(--success)' }} />;
    return <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} className={className}>
      <Label htmlFor="password" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shield style={{ height: 16, width: 16 }} />
        {label}
        {required && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
      </Label>

      <Box sx={{ position: 'relative' }}>
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          style={{
            paddingRight: 80,
            ...(validation && !validation.is_valid ? { borderColor: 'var(--destructive)' } : {}),
          }}
        />

        <Box sx={{ position: 'absolute', inset: 'auto 0 auto auto', top: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 0.5, pr: 1.5 }}>
          {getValidationIcon()}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            style={{ height: 'auto', padding: 4 }}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff style={{ height: 16, width: 16 }} /> : <Eye style={{ height: 16, width: 16 }} />}
          </Button>
        </Box>
      </Box>

      {showStrengthMeter && validation && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Password Strength</Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                ...(validation.strength_level === 'strong' && { color: 'var(--success)' }),
                ...(validation.strength_level === 'medium' && { color: 'var(--warning)' }),
                ...(validation.strength_level === 'weak' && { color: 'error.main' }),
              }}
            >
              {validation.strength_level?.charAt(0).toUpperCase() + validation.strength_level?.slice(1)}
            </Typography>
          </Box>

          <Progress
            value={getStrengthPercentage(validation.strength_score || 0)}
            style={{
              height: 8,
              background: 'hsl(var(--muted))',
            }}
          />
        </Box>
      )}

      {validation && validation.errors && validation.errors.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {validation.errors.map((error: string, index: number) => (
            <Typography key={index} variant="body2" sx={{ fontSize: '0.75rem', color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AlertTriangle style={{ height: 12, width: 12 }} />
              {error}
            </Typography>
          ))}
        </Box>
      )}

      {validation && validation.is_valid && (
        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircle style={{ height: 12, width: 12 }} />
          Password meets security requirements
        </Typography>
      )}
    </Box>
  );
}
