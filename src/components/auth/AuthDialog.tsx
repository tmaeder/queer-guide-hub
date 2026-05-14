import { useEffect, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type Mode = 'signin' | 'signup';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: Mode;
}

export function AuthDialog({ open, onOpenChange, defaultMode = 'signin' }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();

  // Sync mode when the dialog is (re)opened with a different default
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        const msg = error instanceof Error ? error.message : (error as { message?: string })?.message;
        toast({
          title: 'Sign in failed',
          description: msg ?? 'Please try again later.',
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

  const goToSignUp = () => {
    onOpenChange(false);
    navigate('/auth?mode=signup');
  };

  // Dialog can't host the full Signup component cleanly (links, OAuth redirects),
  // so route to the dedicated /auth page in signup mode. Must happen in an effect
  // (setState during render triggers #185), and only when the dialog is actually
  // open (Header mounts a signup-mode AuthDialog at all times).
  useEffect(() => {
    if (open && mode === 'signup') {
      onOpenChange(false);
      navigate('/auth?mode=signup');
    }
  }, [open, mode, onOpenChange, navigate]);

  if (open && mode === 'signup') {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart
              className="w-7 h-7 fill-current animate-pulse"
              style={{ color: 'var(--primary)' }}
            />
            <h6 className="text-base font-bold gradient-text">
              The Queer Guide
            </h6>
          </div>
          <DialogTitle>Welcome Back</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to continue your journey
          </p>
        </DialogHeader>

        <div className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
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
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center">
                <span className="text-xs bg-background px-3 text-muted-foreground font-medium uppercase">
                  New to The Queer Guide?
                </span>
              </div>
            </div>

            <div className="mt-4 text-center">
              <Button variant="outline" onClick={goToSignUp} className="w-full">
                Create account
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
