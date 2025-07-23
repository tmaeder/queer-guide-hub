import { Bell, BellRing, Heart, Users, Map, Smile, Handshake, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotifications } from "@/hooks/useNotifications";
import { useProfile } from "@/hooks/useProfile";
import { NotificationList } from "./NotificationList";
export const NotificationBell = () => {
  const {
    unreadCount
  } = useNotifications();
  const {
    profile,
    updateProfile
  } = useProfile();
  const userModes = [{
    value: 'dating',
    icon: Heart,
    label: 'Dating'
  }, {
    value: 'friends',
    icon: Users,
    label: 'Friends'
  }, {
    value: 'exploration',
    icon: Map,
    label: 'Exploration'
  }, {
    value: 'fun',
    icon: Smile,
    label: 'Fun'
  }, {
    value: 'networking',
    icon: Handshake,
    label: 'Networking'
  }, {
    value: 'community',
    icon: Home,
    label: 'Community'
  }];
  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community'
    });
  };
  return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unreadCount > 0 && <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        
        
        {/* User mode selector */}
        <div className="flex items-center justify-between p-2 mb-3 border-b border-border">
          
          <Select value={profile?.user_mode || 'exploration'} onValueChange={handleModeChange}>
            <SelectTrigger className="w-full">
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
              {userModes.map(mode => <SelectItem key={mode.value} value={mode.value}>
                  <div className="flex items-center gap-2">
                    <mode.icon className="h-4 w-4" />
                    <span>{mode.label}</span>
                  </div>
                </SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>;
};