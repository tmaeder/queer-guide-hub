import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Menu, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AdvancedSearchBar } from '@/components/search/AdvancedSearchBar';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { NotificationBell } from '@/components/notifications/NotificationBell';
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
          <h1 className="text-xl font-bold gradient-text">Queer Guide</h1>
        </Link>

        <AdvancedSearchBar />

        <div className="flex items-center gap-4">
          {user && <NotificationBell />}
          {user ? <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/my-bookings')}>
                  My Bookings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/profile/settings')}>
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/users')}>
                  User Directory
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/messages')}>
                  Messages
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/content')}>
                  Content Management
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> : <Button onClick={() => setAuthDialogOpen(true)} className="bg-gradient-primary hover:opacity-90 transition-opacity h-9 w-9 px-0">
              <User className="h-4 w-4" />
            </Button>}
          
          <ThemeToggle />
          
          <Button variant="ghost" size="sm" className="md:hidden">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}