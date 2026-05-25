import { Heart, MapPin, UserCheck, Users } from 'lucide-react';

// Common lucide icons used by SocialSignalBar consumers. Keep this module
// component-free so the bar can benefit from fast-refresh.
export const SignalIcons = {
  friends: UserCheck,
  group: Users,
  going: UserCheck,
  saved: Heart,
  trip: MapPin,
} as const;
