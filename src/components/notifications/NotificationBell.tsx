import { Bell, BellRing, Heart, Users, Map, Smile, Handshake, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications } from '@/hooks/useNotifications';
import { useProfile } from '@/hooks/useProfile';
import { NotificationList } from './NotificationList';

export const NotificationBell = () => {
  const { unreadCount } = useNotifications();
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
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community',
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" style={{ position: 'relative' }} aria-label="Notifications">
          {unreadCount > 0 ? (
            <BellRing style={{ height: 20, width: 20 }} />
          ) : (
            <Bell style={{ height: 20, width: 20 }} />
          )}
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              style={{
                position: 'absolute',
                top: -8,
                right: -8,
                height: 20,
                width: 20,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: 320 }}>
        {/* User mode selector */}
        <div className="flex items-center justify-between p-2 mb-3 border-b border-border">
          <Select value={profile?.user_mode || 'exploration'} onValueChange={handleModeChange}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue>
                <span className="flex items-center gap-2">
                  {(() => {
                    const CurrentIcon = userModes.find((m) => m.value === profile?.user_mode)?.icon;
                    return CurrentIcon ? <CurrentIcon style={{ height: 16, width: 16 }} /> : null;
                  })()}
                  <span>{userModes.find((m) => m.value === profile?.user_mode)?.label}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {userModes.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  <span className="flex items-center gap-2">
                    <mode.icon style={{ height: 16, width: 16 }} />
                    <span>{mode.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
