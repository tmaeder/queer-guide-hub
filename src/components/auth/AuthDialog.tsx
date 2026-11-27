import { useEffect, useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Eye, EyeOff, Lock, Luggage, Mail, Users } from '@/components/icons';
import { Wordmark } from '@/components/brand/Wordmark';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTurnstile } from '@/hooks/useTurnstile';

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
  const {
    token: captchaToken,
    widget: captcha,
    reset: resetCaptcha,
    required: captchaRequired,
  } = useTurnstile();

  // Sync mode when the dialog is (re)opened with a different default
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (captchaRequired && !captchaToken) {
      toast({
        title: 'Sign in failed',
        description: 'Please complete the captcha and try again.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(email, password, captchaToken ?? undefined);
      if (error) {
        // Turnstile tokens are single-use — refresh for the next attempt.
        resetCaptcha();
        const msg =
          error instanceof Error ? error.message : (error as { message?: string })?.message;
        toast({
          title: 'Sign in failed',
          description: msg ?? 'Please try again later.',
          variant: 'destructive',
        });
      } else {
        onOpenChange(false);
      }
    } catch (_error) {
      resetCaptcha();
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
  // so route to the dedicated /auth page in signup mode. Gated on `open` so a
  // closed instance with defaultMode="signup" doesn't redirect during render.
  useEffect(() => {
    if (open && mode === 'signup') {
      onOpenChange(false);
      navigate('/auth?mode=signup');
    }
  }, [open, mode, onOpenChange, navigate]);

  if (open && mode === 'signup') return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden bg-card p-0">
        {/* The four lines meeting: the brand's master-symbol moment, used as a
            thin stripe rather than a wash. */}
        <div aria-hidden className="intersection-gradient h-1.5 w-full" />
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <DialogHeader>
            {/* Wordmark alone — see Auth.tsx. This one broke §03 three ways:
              the heart, `gradient-text` (the wordmark "carries no colour", and
              gradients are banned outright), and `animate-pulse` on the mark of
              a sign-in surface. */}
            <div className="mb-6 flex items-center justify-center">
              <Wordmark className="text-title text-foreground" />
            </div>
            <DialogTitle className="text-center text-headline">Welcome back</DialogTitle>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Sign in to save trips, follow events and meet people.
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-hidden>
              {[
                [Luggage, 'Trips'],
                [CalendarDays, 'Events'],
                [Users, 'People'],
              ].map(([Icon, label]) => (
                <li
                  key={label as string}
                  className="inline-flex items-center gap-1.5 rounded-badge bg-muted px-2.5 py-1 text-xs font-bold"
                >
                  <Icon size={14} />
                  {label as string}
                </li>
              ))}
            </ul>
          </DialogHeader>

          <div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail
                      size={16}
                      aria-hidden
                      className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 ps-10"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock
                      size={16}
                      aria-hidden
                      className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 ps-10 pr-12"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute inset-y-0 right-0 h-full min-h-0 rounded-l-none px-4 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {captcha}

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full"
                disabled={loading || (captchaRequired && !captchaToken)}
              >
                {loading ? (
                  <>
                    <TrackLoader size={16} className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center gap-4" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                New to Queer Guide?
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <p className="sr-only">New to Queer Guide?</p>
            <Button variant="outline" onClick={goToSignUp} className="mt-4 h-12 w-full">
              Create account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
