import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const {
    user,
    signOut
  } = useAuth();
  const { profile, updateProfile } = useProfile();

  const userModes = [
    { value: 'dating', icon: Heart, label: 'Dating' },
    { value: 'friends', icon: Users, label: 'Friends' },
    { value: 'exploration', icon: Map, label: 'Exploration' },
    { value: 'fun', icon: Smile, label: 'Fun' },
    { value: 'networking', icon: Handshake, label: 'Networking' },
    { value: 'community', icon: Home, label: 'Community' },
  ];

  const handleModeChange = async (mode: string) => {
    await updateProfile({ user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community' });
  };
  return <header className="bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Heart className="h-8 w-8 text-primary fill-current" />
        </Link>

        <UniversalSearchBar />

        <div className="flex items-center gap-2">
          {user ? <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 px-0">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-screen left-0 right-0 p-4 bg-background border border-border h-[160px]">
                <div className="flex items-center justify-between p-2 mb-3">
                  <span className="text-sm font-medium">Current Mode</span>
                  <Select value={profile?.user_mode || 'exploration'} onValueChange={handleModeChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const CurrentIcon = userModes.find(m => m.value === profile?.user_mode)?.icon;
                            return CurrentIcon ? <CurrentIcon className="h-4 w-4" /> : null;
                          })()}
                          <span>{userModes.find(m => m.value === profile?.user_mode)?.label}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {userModes.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          <div className="flex items-center gap-2">
                            <mode.icon className="h-4 w-4" />
                            <span>{mode.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between p-4">
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/my-bookings')}>
                    <CreditCard className="h-4 w-4 mb-1" />
                    <span className="text-xs">Bookings</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/favorites')}>
                    <Heart className="h-4 w-4 mb-1" />
                    <span className="text-xs">Favorites</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/profile/settings')}>
                    <Settings className="h-4 w-4 mb-1" />
                    <span className="text-xs">Settings</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/users')}>
                    <Users className="h-4 w-4 mb-1" />
                    <span className="text-xs">Users</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/groups')}>
                    <UserCheck className="h-4 w-4 mb-1" />
                    <span className="text-xs">Groups</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/messages')}>
                    <MessageSquare className="h-4 w-4 mb-1" />
                    <span className="text-xs">Messages</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/friends')}>
                    <Users className="h-4 w-4 mb-1" />
                    <span className="text-xs">Friends</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto" onClick={() => navigate('/accessibility')}>
                    <Accessibility className="h-4 w-4 mb-1" />
                    <span className="text-xs">Access</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="flex flex-col items-center p-2 h-auto text-destructive" onClick={signOut}>
                    <LogOut className="h-4 w-4 mb-1" />
                    <span className="text-xs">Logout</span>
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu> : <Button onClick={() => setAuthDialogOpen(true)} className="bg-primary hover:opacity-90 transition-opacity h-9 w-9 px-0">
              <User className="h-4 w-4" />
            </Button>}
           
          <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && <div className="absolute top-16 left-0 right-0 bg-background border-t border-border z-50 shadow-lg">
          <nav className="container mx-auto px-4 py-4">
            <div className="flex justify-between px-4">
              <Link to="/venues" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <MapPin className="h-6 w-6 mb-1" />
                <span className="text-xs">Venues</span>
              </Link>
              <Link to="/events" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Calendar className="h-6 w-6 mb-1" />
                <span className="text-xs">Events</span>
              </Link>
              <Link to="/marketplace" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Store className="h-6 w-6 mb-1" />
                <span className="text-xs">Market</span>
              </Link>
              <Link to="/users" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Users className="h-6 w-6 mb-1" />
                <span className="text-xs">Users</span>
              </Link>
              <Link to="/groups" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <UserCheck className="h-6 w-6 mb-1" />
                <span className="text-xs">Groups</span>
              </Link>
              <Link to="/tags" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Tags className="h-6 w-6 mb-1" />
                <span className="text-xs">Wiki</span>
              </Link>
              <Link to="/directory" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Globe className="h-6 w-6 mb-1" />
                <span className="text-xs">Locations
            </span>
              </Link>
              <Link to="/travel" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Plane className="h-6 w-6 mb-1" />
                <span className="text-xs">Travel</span>
              </Link>
              <Link to="/news" className="flex flex-col items-center p-3 text-foreground hover:bg-muted transition-colors rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                <Newspaper className="h-6 w-6 mb-1" />
                <span className="text-xs">News</span>
              </Link>
            </div>
          </nav>
        </div>}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}