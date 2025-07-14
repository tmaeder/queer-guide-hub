import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Menu, User, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AdvancedSearchBar } from '@/components/search/AdvancedSearchBar';
export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const {
    user,
    signOut
  } = useAuth();
  return <header className="bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Heart className="h-8 w-8 text-primary fill-current" />
          
        </Link>

        <AdvancedSearchBar />

        <div className="flex items-center gap-4">
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
           
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-16 left-0 right-0 bg-background z-50 shadow-lg">
          <nav className="container mx-auto px-4 py-4">
            <div className="flex flex-col space-y-2">
              <Link 
                to="/venues" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Venues
              </Link>
              <Link 
                to="/events" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Events
              </Link>
              <Link 
                to="/marketplace" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Marketplace
              </Link>
              <Link 
                to="/directory" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Wiki
              </Link>
              <Link 
                to="/travel" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Locations
              </Link>
              <Link 
                to="/news" 
                className="px-4 py-2 text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                News
              </Link>
            </div>
          </nav>
        </div>
      )}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}