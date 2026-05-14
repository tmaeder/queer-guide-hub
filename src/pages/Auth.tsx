import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import Signup from '@/components/auth/Signup';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { PasskeyButton } from '@/components/auth/PasskeyButton';

type Mode = 'signin' | 'signup' | 'forgot';

export default function Auth() {
  const navigate = useLocalizedNavigate();
  const { signIn, resetPassword, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<Mode>(initialMode);

  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (mode === 'signup' && urlMode !== 'signup') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set('mode', 'signup');
        return next;
      }, { replace: true });
    } else if (mode !== 'signup' && urlMode === 'signup') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('mode');
        return next;
      }, { replace: true });
    }
  }, [mode, searchParams, setSearchParams]);
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
          <Signup onBack={() => setMode('signin')} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 6rem)' }}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-center gap-2">
                  <Heart className="w-8 h-8 fill-current text-primary" />
                  <h5 className="text-xl font-bold">The Queer Guide</h5>
                </div>
                <CardTitle>
                  {mode === 'forgot' ? t('auth.resetPassword', 'Reset password') : t('auth.welcomeBack', 'Welcome back')}
                </CardTitle>
                <CardDescription>
                  {mode === 'forgot'
                    ? t('auth.forgotBlurb', "We'll email you a reset link.")
                    : t('auth.signinBlurb', 'Sign in to continue')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
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
        </div>
      </div>
    </div>
  );
}
