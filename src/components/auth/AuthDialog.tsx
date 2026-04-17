import { useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: 'Sign in failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        onOpenChange(false);
      }
    } catch (_error) {
      toast({
        title: 'Something went wrong',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpClick = () => {
    onOpenChange(false);
    navigate('/auth');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 1.5,
            }}
          >
            <Heart
              style={{
                width: 28,
                height: 28,
                color: 'var(--primary)',
                fill: 'currentColor',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700 }} className="gradient-text">
              The Queer Guide
            </Typography>
          </Box>
          <DialogTitle>
            Welcome Back
          </DialogTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Sign in to continue your journey
          </Typography>
        </DialogHeader>

        <Box sx={{ px: 3, pb: 3 }}>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label
                  htmlFor="email"

                >
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label
                  htmlFor="password"

                >
                  Password
                </Label>
                <Box sx={{ position: 'relative' }}>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}

                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: 16, height: 16 }} />
                    ) : (
                      <Eye style={{ width: 16, height: 16 }} />
                    )}
                  </Button>
                </Box>
              </Box>
            </Box>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2
                    style={{
                      marginRight: 8,
                      height: 16,
                      width: 16,
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <Separator style={{ width: '100%' }} />
              </Box>
              <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <Typography
                  variant="caption"
                  sx={{
                    bgcolor: 'background.paper',
                    px: 1.5,
                    color: 'text.secondary',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                  }}
                >
                  New to The Queer Guide?
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button variant="outline" onClick={handleSignUpClick} style={{ width: '100%' }}>
                Create your account with guided signup
              </Button>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
