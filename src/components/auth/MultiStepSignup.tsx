import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    <Card className="max-w-xl mx-auto rounded-3xl shadow-xl">
      <CardHeader>
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-foreground" />
                {t('auth.signup.stepIndicator', {
                  defaultValue: 'Step {{current}} of {{total}}',
                  current: currentStep,
                  total: totalSteps,
                })}
              </div>
              <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-balance">{t('auth.signup.title', 'Create your account')}</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {t(`auth.signup.steps.${stepKeys[currentStep - 1]}`)}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onBack} className="flex-shrink-0">
              {t('auth.signup.haveAccount', 'Sign in')}
            </Button>
          </div>
          <Progress value={progress} className="w-full h-1" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          {currentStep === 1 && (
            <>
              <OAuthButtons onError={setError} />
              <div className="relative text-center my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background px-2 text-xs text-muted-foreground uppercase">
                  {t('auth.signup.orWithEmail', 'Or with email')}
                </span>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="min-h-[280px]">{renderStep()}</div>

          <div className="flex justify-between pt-5 border-t border-border">
            <Button variant="outline" onClick={goPrev} disabled={currentStep === 1 || isLoading} className="rounded-full">
              <ChevronLeft className="w-4 h-4 mr-1.5" />
              {t('common.back', 'Back')}
            </Button>
            {currentStep < totalSteps ? (
              <Button onClick={goNext} disabled={isLoading} className="rounded-full px-6">
                {t('common.next', 'Next')}
                <ChevronRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading} className="rounded-full px-6">
                {isLoading && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {t('auth.signup.create', 'Create account')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
