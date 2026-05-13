import { useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FloatingInput } from '@/components/effects';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import MultiStepSignup from '@/components/auth/MultiStepSignup';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { BackgroundDots } from '@/components/effects/BackgroundDots';
import { SpotlightEffect } from '@/components/effects/SpotlightEffect';

type Mode = 'signin' | 'signup' | 'forgot';

export default function Auth() {
  const navigate = useLocalizedNavigate();
  const { signIn, resetPassword, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  if (user) {
    navigate('/');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) {
      setError(t('auth.errors.fillAllFields', 'Please fill in all fields'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: signInError } = await signIn(loginData.email, loginData.password);
      if (signInError) {
        if (signInError.message?.includes('Invalid login credentials')) {
          setError(t('auth.errors.invalidCredentials', 'Invalid email or password.'));
        } else if (signInError.message?.includes('Email not confirmed')) {
          setError(t('auth.errors.emailNotConfirmed', 'Please confirm your email before signing in.'));
        } else {
          setError(signInError.message);
        }
      } else {
        toast({ title: t('auth.welcomeBack', 'Welcome back!') });
        navigate('/');
      }
    } catch {
      setError(t('auth.errors.unexpected', 'An unexpected error occurred. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email) {
      setError(t('auth.errors.emailRequired', 'Email is required'));
      return;
    }
    setIsLoading(true);
    setError(null);
    const { error: resetError } = await resetPassword(loginData.email);
    setIsLoading(false);
    if (resetError) setError(resetError.message);
    else setResetSent(true);
  };

  if (mode === 'signup') {
    return (
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4">
          <MultiStepSignup onBack={() => setMode('signin')} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <BackgroundDots className="absolute inset-0 z-0 pointer-events-none" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-mesh opacity-80" />
      <div className="relative z-10 container mx-auto px-6 py-12">
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 6rem)' }}>
          <SpotlightEffect className="w-full max-w-md">
            <Card className="rounded-3xl border-border/80 shadow-xl backdrop-blur-sm bg-background/95">
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-center gap-2">
                    <Heart className="w-8 h-8 fill-current text-foreground" />
                    <h5 className="text-xl font-bold tracking-tight">The Queer Guide</h5>
                  </div>
                  <CardTitle className="text-3xl font-bold tracking-tight text-center text-balance">
                    {mode === 'forgot' ? t('auth.resetPassword', 'Reset password') : t('auth.welcomeBack', 'Welcome back')}
                  </CardTitle>
                  <CardDescription className="text-center text-base">
                    {mode === 'forgot'
                      ? t('auth.forgotBlurb', "We'll email you a reset link.")
                      : t('auth.signinBlurb', 'Sign in to continue')}
                  </CardDescription>
                </div>
              </CardHeader>

            <CardContent className="pb-7">
              <div className="flex flex-col gap-6">
                {error && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {mode === 'signin' && (
                  <>
                    <OAuthButtons onError={setError} />
                    <div className="relative text-center my-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <span className="relative bg-background px-2 text-xs text-muted-foreground uppercase">
                        {t('auth.orWithEmail', 'Or with email')}
                      </span>
                    </div>
                  </>
                )}

                {resetSent ? (
                  <Alert>
                    <AlertDescription>
                      {t('auth.resetSent', 'Check your email for a password reset link.')}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <form onSubmit={mode === 'forgot' ? handleForgot : handleLogin}>
                    <div className="flex flex-col gap-4">
                      <FloatingInput
                        label={t('auth.fields.email', 'Email')}
                        type="email"
                        autoComplete="email"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        disabled={isLoading}
                        required
                      />

                      {mode === 'signin' && (
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor="password">{t('auth.fields.password', 'Password')}</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMode('forgot');
                                setError(null);
                              }}
                            >
                              {t('auth.forgotPassword', 'Forgot password?')}
                            </Button>
                          </div>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              value={loginData.password}
                              onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                              disabled={isLoading}
                              required
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={isLoading}
                              aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      )}

                      <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {mode === 'forgot' ? t('auth.sendResetLink', 'Send reset link') : t('auth.signIn', 'Sign in')}
                      </Button>
                    </div>
                  </form>
                )}

                {mode === 'signin' && <PasskeyButton mode="signin" style={{ width: '100%' }} />}

                <div className="text-center pt-4">
                  {mode === 'forgot' ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMode('signin');
                        setError(null);
                        setResetSent(false);
                      }}
                    >
                      <span className="text-sm text-muted-foreground">
                        {t('auth.backToSignIn', 'Back to sign in')}
                      </span>
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setMode('signup')}>
                      <span className="text-sm text-muted-foreground">
                        {t('auth.noAccount', "Don't have an account? Create one")}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          </SpotlightEffect>
        </div>
      </div>
    </div>
  );
}
