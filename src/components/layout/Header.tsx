import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Menu, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const navigate = useNavigate();
  const {
    user,
    signOut
  } = useAuth();
  return <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Heart className="h-8 w-8 text-primary fill-current" />
          <h1 className="text-xl font-bold gradient-text">The Queer Guide</h1>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/venues">Venues</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/events">Events</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/marketplace">Marketplace</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/directory">Directory</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/tags">Wiki</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/community">Community</Link>
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
            <Link to="/news">News</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-4">
          {user ? <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile/settings')}>
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/content')}>
                  Content Management
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> : <Button onClick={() => setAuthDialogOpen(true)} className="bg-gradient-primary hover:opacity-90 transition-opacity">
              Sign In
            </Button>}
          
          <Button variant="ghost" size="sm" className="md:hidden">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}