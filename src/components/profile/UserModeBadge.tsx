import { Heart, Users, Map, Smile, Handshake, Home } from 'lucide-react';

interface UserModeBadgeProps {
  mode: string;
  size?: 'sm' | 'md' | 'lg';
}

const modeConfig = {
  dating:      { icon: Heart,     label: 'Looking for Love',    bgcolor: 'rgba(236, 72, 153, 0.1)', color: 'hsl(var(--brand))' },
  friends:     { icon: Users,     label: 'Making Friends',      bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
  exploration: { icon: Map,       label: 'Exploring',           bgcolor: 'rgba(34, 197, 94, 0.1)',  color: '#16a34a' },
  fun:         { icon: Smile,     label: 'Here for Fun',        bgcolor: 'rgba(234, 179, 8, 0.1)',  color: '#ca8a04' },
  networking:  { icon: Handshake, label: 'Networking',          bgcolor: 'hsl(var(--muted))',       color: 'hsl(var(--foreground))' },
  community:   { icon: Home,      label: 'Building Community',  bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5' },
};

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function UserModeBadge({ mode, size = 'md' }: UserModeBadgeProps) {
  const config = modeConfig[mode as keyof typeof modeConfig];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizeClasses[size]}`}
      style={{ backgroundColor: config.bgcolor, color: config.color }}
    >
      <config.icon style={{ width: 12, height: 12 }} />
      <span>{config.label}</span>
    </span>
  );
}
