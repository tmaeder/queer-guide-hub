import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut } from 'lucide-react';
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
                <Button variant="ghost" size="sm" className="h-9 w-9 px-0">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto p-2">
                <div className="flex space-x-1">
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/my-bookings')}>
                    <CreditCard className="h-4 w-4 mb-1" />
                    <span className="text-xs">Bookings</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/profile/settings')}>
                    <Settings className="h-4 w-4 mb-1" />
                    <span className="text-xs">Settings</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/users')}>
                    <Users className="h-4 w-4 mb-1" />
                    <span className="text-xs">Users</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/messages')}>
                    <MessageSquare className="h-4 w-4 mb-1" />
                    <span className="text-xs">Messages</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/admin/content')}>
                    <FileText className="h-4 w-4 mb-1" />
                    <span className="text-xs">Admin</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto text-destructive" onClick={signOut}>
                    <LogOut className="h-4 w-4 mb-1" />
                    <span className="text-xs">Logout</span>
                  </Button>
                </div>
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
            <div className="flex justify-center space-x-4">
              <Link 
                to="/venues" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <MapPin className="h-6 w-6 mb-1" />
                <span className="text-xs">Venues</span>
              </Link>
              <Link 
                to="/events" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Calendar className="h-6 w-6 mb-1" />
                <span className="text-xs">Events</span>
              </Link>
              <Link 
                to="/marketplace" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Store className="h-6 w-6 mb-1" />
                <span className="text-xs">Market</span>
              </Link>
              <Link 
                to="/directory" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Globe className="h-6 w-6 mb-1" />
                <span className="text-xs">Wiki</span>
              </Link>
              <Link 
                to="/travel" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Plane className="h-6 w-6 mb-1" />
                <span className="text-xs">Travel</span>
              </Link>
              <Link 
                to="/news" 
                className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Newspaper className="h-6 w-6 mb-1" />
                <span className="text-xs">News</span>
              </Link>
            </div>
          </nav>
        </div>
      )}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}