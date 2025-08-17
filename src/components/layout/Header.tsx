import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf, UsersRound, Rss, Upload, FileEdit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getGravatarUrl } from '@/lib/gravatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationList } from '@/components/notifications/NotificationList';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import CardNav, { type CardNavItem } from '@/components/ui/card-nav';
export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    user,
    signOut
  } = useAuth();
  const {
    profile,
    updateProfile
  } = useProfile();
  const { unreadCount } = useNotifications();
  const { isAdmin } = useAdminRoles();
  const avatarSrc = profile?.avatar_url || (user?.email ? getGravatarUrl(user.email, 96, 'mp') || undefined : undefined);
  const userModes = [{
    value: 'dating',
    icon: Heart,
    label: 'Looking for Love'
  }, {
    value: 'friends',
    icon: Users,
    label: 'Making Friends'
  }, {
    value: 'exploration',
    icon: Map,
    label: 'Exploring the Scene'
  }, {
    value: 'fun',
    icon: Smile,
    label: 'Just Here for Fun'
  }, {
    value: 'networking',
    icon: Handshake,
    label: 'Professional Networking'
  }, {
    value: 'community',
    icon: Home,
    label: 'Building Community'
  }];
  const navigationSections = [{
    title: "Explore the Scene",
    items: [{
      to: "/events",
      icon: Calendar,
      label: "Events"
    }, {
      to: "/directory",
      icon: Globe,
      label: "Places"
    }, {
      to: "/venues",
      icon: MapPin,
      label: "Spaces"
    }, {
      to: "/marketplace",
      icon: Store,
      label: "Market"
    }, {
      to: "/ressources",
      icon: Tags,
      label: "Ressources"
    }, {
      to: "/news",
      icon: Newspaper,
      label: "News"
    }, {
      to: "/personalities",
      icon: Users,
      label: "Personalities"
    }]
  }, {
    title: "Community",
    items: [{
      to: "/feed",
      icon: Rss,
      label: "Feed"
    }, {
      to: "/groups",
      icon: UsersRound,
      label: "Crews"
    }, {
      to: "/users",
      icon: UserCheck,
      label: "Users"
    }]
  }];
  const userMenuItems = [{
    to: "/favorites",
    icon: Heart,
    label: "Faves"
  }, {
    to: "/profile/settings",
    icon: Settings,
    label: "My Vibe"
  }, {
    to: "/messages",
    icon: MessageSquare,
    label: "DMs"
  }, {
    to: "/friends",
    icon: Users,
    label: "Squad"
  }, {
    to: "/my-groups",
    icon: UsersRound,
    label: "My Crews"
  }, {
    to: "/accessibility",
    icon: Accessibility,
    label: "Access"
  }];
  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community'
    });
  };
  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };
  const cardNavItems: CardNavItem[] = [
    {
      label: "Explore",
      bgColor: "hsl(var(--muted))",
      textColor: "hsl(var(--muted-foreground))",
      links: [
        { label: "Venues", href: "/venues", ariaLabel: "Browse venues" },
        { label: "Events", href: "/events", ariaLabel: "Browse events" },
        { label: "Directory", href: "/directory", ariaLabel: "Browse directory" },
        { label: "Marketplace", href: "/marketplace", ariaLabel: "Browse marketplace" }
      ]
    },
    {
      label: "Community",
      bgColor: "hsl(var(--accent))",
      textColor: "hsl(var(--accent-foreground))",
      links: [
        { label: "Feed", href: "/feed", ariaLabel: "Community feed" },
        { label: "Groups", href: "/groups", ariaLabel: "Join groups" },
        { label: "News", href: "/news", ariaLabel: "Latest news" },
        { label: "Personalities", href: "/personalities", ariaLabel: "Featured personalities" }
      ]
    },
    {
      label: "Connect",
      bgColor: "hsl(var(--card))",
      textColor: "hsl(var(--card-foreground))",
      links: [
        { label: "Messages", href: "/messages", ariaLabel: "Your messages" },
        { label: "Friends", href: "/friends", ariaLabel: "Your friends" },
        { label: "Users", href: "/users", ariaLabel: "Browse users" },
        { label: "Profile", href: "/profile/settings", ariaLabel: "Your profile" }
      ]
    }
  ];

  return (
    <>
      <CardNav
        logo={
          <Link to="/" className="flex items-center space-x-2">
            <Heart className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">queerguide</span>
          </Link>
        }
        items={cardNavItems}
        baseColor="hsl(var(--background))"
        menuColor="hsl(var(--foreground))"
        buttonBgColor="hsl(var(--primary))"
        buttonTextColor="hsl(var(--primary-foreground))"
        ctaText={user ? "Dashboard" : "Sign In"}
        onCtaClick={() => {
          if (user) {
            navigate('/feed');
          } else {
            setAuthDialogOpen(true);
          }
        }}
      />

      {/* Hidden search bar for mobile - positioned below card nav */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md z-40 md:hidden">
        <UniversalSearchBar />
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
}