import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';
import { ConsentBlock } from '../ConsentBlock';
import type { SignupData } from '../MultiStepSignup';

interface Props {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function AccountStep({ data, updateData }: Props) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid = !emailTouched || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="signup-email">{t('auth.fields.email', 'Email')}</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder={t('auth.placeholders.email', 'you@example.com')}
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={!emailValid}
          required
        />
        {!emailValid && (
          <span style={{ fontSize: 12, color: 'var(--mui-palette-error-main)' }}>
            {t('auth.errors.emailInvalid', 'Please enter a valid email address')}
          </span>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="signup-password">{t('auth.fields.password', 'Password')}</Label>
        <Box sx={{ position: 'relative' }}>
          <Input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.placeholders.password', 'At least 10 characters')}
            value={data.password}
            onChange={(e) => updateData({ password: e.target.value })}
            required
            minLength={10}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"

            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
          >
            {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
          </Button>
        </Box>
        <PasswordStrengthMeter
          password={data.password}
          email={data.email}
          onScoreChange={(score) => updateData({ passwordScore: score })}
        />
      </Box>

      <ConsentBlock value={data.consent} onChange={(c) => updateData({ consent: c })} />
    </Box>
  );
}
