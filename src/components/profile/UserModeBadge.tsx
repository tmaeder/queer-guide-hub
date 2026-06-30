import { Heart, Users, Map, Smile, Handshake, Home } from 'lucide-react';
import { USER_MODE_LABELS } from '@/lib/userMode';

interface UserModeBadgeProps {
  mode: string;
  size?: 'sm' | 'md' | 'lg';
}

// Monochrome — modes are differentiated by icon + label, not color (the former
// per-mode hues were removed in the monochrome strip).
const modeConfig = {
  dating:      { icon: Heart,     label: USER_MODE_LABELS.dating },
  friends:     { icon: Users,     label: USER_MODE_LABELS.friends },
  exploration: { icon: Map,       label: USER_MODE_LABELS.exploration },
  fun:         { icon: Smile,     label: USER_MODE_LABELS.fun },
  networking:  { icon: Handshake, label: USER_MODE_LABELS.networking },
  community:   { icon: Home,      label: USER_MODE_LABELS.community },
};

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-4 py-1.5',
};

export function UserModeBadge({ mode, size = 'md' }: UserModeBadgeProps) {
  const config = modeConfig[mode as keyof typeof modeConfig];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted font-medium text-foreground ${sizeClasses[size]}`}
    >
      <config.icon style={{ width: 12, height: 12 }} />
      <span>{config.label}</span>
    </span>
  );
}
