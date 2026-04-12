import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import MultiStepSignup from '@/components/auth/MultiStepSignup';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

type Mode = 'signin' | 'signup' | 'forgot';

export default function Auth() {
  const navigate = useNavigate();
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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 6 }}>
        <Container maxWidth="sm">
          <MultiStepSignup onBack={() => setMode('signin')} />
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="sm" sx={{ px: 3, py: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 6rem)' }}>
          <Card sx={{ width: '100%' }}>
            <CardHeader sx={{ textAlign: 'center' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Heart style={{ width: 32, height: 32, fill: 'currentcolor' }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    The Queer Guide
                  </Typography>
                </Box>
                <CardTitle>
                  {mode === 'forgot' ? t('auth.resetPassword', 'Reset password') : t('auth.welcomeBack', 'Welcome back')}
                </CardTitle>
                <CardDescription>
                  {mode === 'forgot'
                    ? t('auth.forgotBlurb', "We'll email you a reset link.")
                    : t('auth.signinBlurb', 'Sign in to continue')}
                </CardDescription>
              </Box>
            </CardHeader>

            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {error && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {mode === 'signin' && (
                  <>
                    <OAuthButtons onError={setError} />
                    <Box sx={{ position: 'relative', textAlign: 'center', my: 1 }}>
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', borderTop: 1, borderColor: 'divider' }} />
                      </Box>
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ position: 'relative', bgcolor: 'background.paper', px: 1, color: 'text.secondary', textTransform: 'uppercase' }}
                      >
                        {t('auth.orWithEmail', 'Or with email')}
                      </Typography>
                    </Box>
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="email">{t('auth.fields.email', 'Email')}</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder={t('auth.placeholders.email', 'you@example.com')}
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          disabled={isLoading}
                          required
                        />
                      </Box>

                      {mode === 'signin' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Label htmlFor="password">{t('auth.fields.password', 'Password')}</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMode('forgot');
                                setError(null);
                              }}
                              sx={{ p: 0, height: 'auto', fontSize: '0.75rem' }}
                            >
                              {t('auth.forgotPassword', 'Forgot password?')}
                            </Button>
                          </Box>
                          <Box sx={{ position: 'relative' }}>
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
                              sx={{
                                position: 'absolute',
                                right: 4,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                height: 32,
                                width: 32,
                                p: 0,
                              }}
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={isLoading}
                              aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                            >
                              {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                            </Button>
                          </Box>
                        </Box>
                      )}

                      <Button type="submit" sx={{ width: '100%' }} disabled={isLoading}>
                        {isLoading && <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />}
                        {mode === 'forgot' ? t('auth.sendResetLink', 'Send reset link') : t('auth.signIn', 'Sign in')}
                      </Button>
                    </Box>
                  </form>
                )}

                {mode === 'signin' && <PasskeyButton mode="signin" style={{ width: '100%' }} />}

                <Box sx={{ textAlign: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  {mode === 'forgot' ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMode('signin');
                        setError(null);
                        setResetSent(false);
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {t('auth.backToSignIn', 'Back to sign in')}
                      </Typography>
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setMode('signup')}>
                      <Typography variant="body2" color="text.secondary">
                        {t('auth.noAccount', "Don't have an account? Create one")}
                      </Typography>
                    </Button>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
}
