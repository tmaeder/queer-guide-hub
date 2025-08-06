import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf, UsersRound, Rss } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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

  const navigationSections = [
    {
      title: "Explore",
      items: [
        { to: "/events", icon: Calendar, label: "Events" },
        { to: "/directory", icon: Globe, label: "Locations" },
        { to: "/travel", icon: Plane, label: "Travel" },
        { to: "/venues", icon: MapPin, label: "Venues/Organisations" },
        { to: "/marketplace", icon: Store, label: "Market" },
        { to: "/tags", icon: Tags, label: "Wiki" },
        { to: "/news", icon: Newspaper, label: "News" },
        { to: "/donate", icon: Heart, label: "Donate" },
      ]
    },
    {
      title: "Community",
      items: [
        { to: "/feed", icon: Rss, label: "Feed" },
        { to: "/users", icon: UserCheck, label: "Users" },
        { to: "/groups", icon: UsersRound, label: "Groups" },
      ]
    }
  ];

  const userMenuItems = [
    
    { to: "/favorites", icon: Heart, label: "Favorites" },
    { to: "/profile/settings", icon: Settings, label: "My Profile" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/friends", icon: Users, label: "Friends" },
    { to: "/my-groups", icon: UsersRound, label: "My Groups" },
    { to: "/accessibility", icon: Accessibility, label: "Access" },
  ];

  const handleModeChange = async (mode: string) => {
    await updateProfile({ user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community' });
  };

  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };
  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4">
        {/* Main header */}
        <div className="h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <Heart className="h-8 w-8 text-primary fill-current" />
            <span className="text-xl font-bold text-primary">
              Queer Guide
            </span>
          </Link>

          {/* Search */}
          <UniversalSearchBar />

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            {user && <NotificationBell />}
            
            {/* User menu - Always visible when logged in */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4 bg-background border border-border z-50">

                  {/* Quick actions grid */}
                  <div className="grid grid-cols-3 gap-2 p-2">
                    {userMenuItems.map((item) => (
                      <Button 
                        key={item.to}
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col items-center p-3 h-auto gap-1" 
                        onClick={() => navigate(item.to)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-xs">{item.label}</span>
                      </Button>
                    ))}
                  </div>

                  <DropdownMenuSeparator />
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-destructive hover:text-destructive" 
                    onClick={signOut}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={() => setAuthDialogOpen(true)} size="sm">
                <User className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}

            {/* Main menu */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-72 max-h-[80vh] overflow-y-auto p-4 bg-background border border-border z-50"
              >
                {/* Main navigation */}
                {navigationSections.map((section) => (
                  <div key={section.title} className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{section.title}</h3>
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <Button
                          key={item.to}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => handleMenuItemClick(item.to)}
                        >
                          <item.icon className="h-4 w-4 mr-3" />
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* User actions for logged in users */}
                {user && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Account</h3>
                    <div className="space-y-1">
                      {userMenuItems.map((item) => (
                        <Button
                          key={item.to}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => handleMenuItemClick(item.to)}
                        >
                          <item.icon className="h-4 w-4 mr-3" />
                          {item.label}
                        </Button>
                      ))}
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-destructive hover:text-destructive" 
                        onClick={() => {
                          signOut();
                          setMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-3" />
                        Logout
                      </Button>
                    </div>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}