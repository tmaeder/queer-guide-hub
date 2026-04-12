import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAuth } from '@/hooks/useAuth';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { useSignupFunnel } from '@/hooks/useSignupFunnel';
import { OAuthButtons } from './OAuthButtons';
import { EmailVerificationScreen } from './EmailVerificationScreen';
import { isConsentComplete, type ConsentState, emptyConsent } from './ConsentBlock';

import AccountStep from './steps/AccountStep';
import ProfileStep from './steps/ProfileStep';
import InterestsStep from './steps/InterestsStep';

export interface SignupData {
  email: string;
  password: string;
  displayName: string;
  pronouns: string;
  country: string;
  preferredLanguage: string;
  lookingFor: string[];
  interests: string[];
  consent: ConsentState;
  passwordScore: 0 | 1 | 2 | 3 | 4;
}

const initialData: SignupData = {
  email: '',
  password: '',
  displayName: '',
  pronouns: '',
  country: '',
  preferredLanguage: '',
  lookingFor: [],
  interests: [],
  consent: emptyConsent,
  passwordScore: 0,
};

interface Props {
  onBack: () => void;
}

export default function MultiStepSignup({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const { emit, reset: resetFunnel } = useSignupFunnel();
  const { data, update, clear } = useFormPersistence<SignupData>('v2', initialData, [
    'password',
    'consent',
  ]);

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const totalSteps = 3;
  const stepKeys = ['account', 'profile', 'interests'] as const;

  useEffect(() => {
    emit('signup_landing_view');
    // Default preferred language from current i18n
    if (!data.preferredLanguage) update({ preferredLanguage: i18n.language });
    emit('step_started', { step: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!data.email) return t('auth.errors.emailRequired', 'Email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        return t('auth.errors.emailInvalid', 'Please enter a valid email address');
      if (!data.password) return t('auth.errors.passwordRequired', 'Password is required');
      if (data.password.length < 10)
        return t('auth.errors.passwordTooShort', 'Password must be at least 10 characters');
      if (data.passwordScore < 2)
        return t('auth.errors.passwordTooWeak', 'Please choose a stronger password');
      if (!isConsentComplete(data.consent))
        return t('auth.errors.consentRequired', 'Please accept the terms, privacy policy, and confirm you are 18+');
    }
    if (step === 2) {
      if (!data.displayName.trim())
        return t('auth.errors.displayNameRequired', 'Display name is required');
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(currentStep);
    if (err) {
      setError(err);
      emit('step_validation_error', { step: currentStep, metadata: { error: err } });
      return;
    }
    setError(null);
    emit('step_completed', { step: currentStep });
    if (currentStep < totalSteps) {
      const next = currentStep + 1;
      setCurrentStep(next);
      emit('step_started', { step: next });
    }
  };

  const goPrev = () => {
    setError(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    const err = validateStep(currentStep);
    if (err) {
      setError(err);
      return;
    }
    setIsLoading(true);
    setError(null);

    const now = new Date().toISOString();
    const { error: signUpError } = await signUp(data.email, data.password, {
      display_name: data.displayName,
      pronouns: data.pronouns,
      location: data.country,
      preferred_language: data.preferredLanguage,
      looking_for: data.lookingFor,
      interests: data.interests,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      age_confirmed_at: now,
    });

    setIsLoading(false);

    if (signUpError) {
      if (signUpError.message?.includes('User already registered')) {
        setError(t('auth.errors.alreadyRegistered', 'An account with this email already exists. Try signing in.'));
      } else {
        setError(signUpError.message);
      }
      emit('step_validation_error', { step: currentStep, metadata: { error: signUpError.message } });
      return;
    }

    emit('signup_completed', { provider: 'email' });
    setVerificationEmail(data.email);
    clear();
    resetFunnel();
  };

  if (verificationEmail) {
    return <EmailVerificationScreen email={verificationEmail} onBackToLogin={onBack} />;
  }

  const progress = (currentStep / totalSteps) * 100;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <AccountStep data={data} updateData={update} />;
      case 2:
        return <ProfileStep data={data} updateData={update} />;
      case 3:
        return <InterestsStep data={data} updateData={update} />;
      default:
        return null;
    }
  };

  return (
    <Card sx={{ maxWidth: 560, mx: 'auto' }}>
      <CardHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <CardTitle>{t('auth.signup.title', 'Create your account')}</CardTitle>
              <CardDescription>
                {t('auth.signup.stepIndicator', {
                  defaultValue: 'Step {{current}} of {{total}}',
                  current: currentStep,
                  total: totalSteps,
                })}{' '}
                — {t(`auth.signup.steps.${stepKeys[currentStep - 1]}`)}
              </CardDescription>
            </Box>
            <Button variant="outline" size="sm" onClick={onBack}>
              {t('auth.signup.haveAccount', 'Sign in')}
            </Button>
          </Box>
          <Progress value={progress} style={{ width: '100%', height: 6 }} />
        </Box>
      </CardHeader>

      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {currentStep === 1 && (
            <>
              <OAuthButtons onError={setError} />
              <Box sx={{ position: 'relative', textAlign: 'center', my: 1 }}>
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ width: '100%', borderTop: 1, borderColor: 'divider' }} />
                </Box>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ position: 'relative', bgcolor: 'background.paper', px: 1, color: 'text.secondary', textTransform: 'uppercase' }}
                >
                  {t('auth.signup.orWithEmail', 'Or with email')}
                </Typography>
              </Box>
            </>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Box sx={{ minHeight: 280 }}>{renderStep()}</Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button variant="outline" onClick={goPrev} disabled={currentStep === 1 || isLoading}>
              <ChevronLeft style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('common.back', 'Back')}
            </Button>
            {currentStep < totalSteps ? (
              <Button onClick={goNext} disabled={isLoading}>
                {t('common.next', 'Next')}
                <ChevronRight style={{ width: 16, height: 16, marginLeft: 6 }} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading && (
                  <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                )}
                {t('auth.signup.create', 'Create account')}
              </Button>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
