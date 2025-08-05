import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Heart, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpClick = () => {
    onOpenChange(false);
    navigate('/auth');
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full mx-4 p-0 gap-0 bg-gradient-to-br from-background via-background/95 to-background/90 border shadow-xl">
        <DialogHeader className="px-6 pt-6 pb-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart className="h-7 w-7 text-primary fill-current animate-pulse" />
            <span className="text-xl font-bold gradient-text">The Queer Guide</span>
          </div>
          <DialogTitle className="text-2xl font-semibold text-foreground">
            Welcome Back
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to continue your journey
          </p>
        </DialogHeader>
        
        <div className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-background/50 border-input/60 focus:border-primary/60 focus:ring-primary/20"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-background/50 border-input/60 focus:border-primary/60 focus:ring-primary/20 pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 p-0 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? 
                      <EyeOff className="h-4 w-4 text-muted-foreground" /> : 
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    }
                  </Button>
                </div>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]"
              disabled={loading}
            >
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
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-3 text-muted-foreground font-medium">
                  New to The Queer Guide?
                </span>
              </div>
            </div>
            
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={handleSignUpClick}
                className="w-full h-11 border-input/60 hover:bg-muted/50 hover:border-primary/60 transition-all duration-200"
              >
                Create your account with guided signup
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}