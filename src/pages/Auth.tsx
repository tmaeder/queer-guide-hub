import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import MultiStepSignup from '@/components/auth/MultiStepSignup';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';


export default function Auth() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMultiStepSignup, setShowMultiStepSignup] = useState(true);


  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  // Redirect authenticated users
  if (user) {
    navigate('/');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await signIn(loginData.email, loginData.password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please check your email and click the confirmation link before signing in.');
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate('/');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowMultiStepSignup(false);
    setError(null);
  };

  // Show login form when user clicks "Back to Login"
  if (!showMultiStepSignup) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="sm" sx={{ px: 3, py: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 6rem)' }}>
            <Card sx={{ width: '100%' }}>
              <CardHeader sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Heart style={{ width: 32, height: 32, fill: 'currentcolor' }} color="var(--mui-palette-primary-main)" />
                    <Typography variant="h5" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #f472b6, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>The Queer Guide</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <CardTitle>
                      <Typography variant="h5">Welcome Back</Typography>
                    </CardTitle>
                    <CardDescription>
                      Sign in to your account to continue
                    </CardDescription>
                  </Box>
                </Box>
              </CardHeader>

              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleLogin}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          disabled={isLoading}
                          required
                        />
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="password">Password</Label>
                        <Box sx={{ position: 'relative' }}>
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            disabled={isLoading}
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            sx={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', height: 32, width: 32, p: 0 }}
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                          </Button>
                        </Box>
                      </Box>

                      <Button type="submit" sx={{ width: '100%' }} disabled={isLoading}>
                        {isLoading && <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />}
                        Sign In
                      </Button>

                      <Box sx={{ position: 'relative' }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                          <Box component="span" sx={{ width: '100%', borderTop: 1, borderColor: 'divider' }} />
                        </Box>
                        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                          <Typography variant="caption" sx={{ bgcolor: 'background.paper', px: 1, color: 'text.secondary', textTransform: 'uppercase' }}>
                            Or continue with
                          </Typography>
                        </Box>
                      </Box>

                      <PasskeyButton mode="signin" style={{ width: '100%' }} />
                    </Box>
                  </form>

                  <Box sx={{ textAlign: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Button
                      variant="ghost"
                      onClick={() => setShowMultiStepSignup(true)}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Don't have an account? Create one with our guided signup
                      </Typography>
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Box>
    );
  }

  // Default to multi-step signup for new users
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <MultiStepSignup onBack={handleBackToLogin} />
    </Box>
  );
}
