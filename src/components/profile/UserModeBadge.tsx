import { Badge } from '@/components/ui/badge';

interface UserModeBadgeProps {
  mode: string;
  size?: 'sm' | 'md' | 'lg';
}

const modeConfig = {
  dating: { emoji: '💕', label: 'Dating', color: 'bg-pink-500/10 text-pink-600 border-pink-200' },
  friends: { emoji: '👥', label: 'Friends', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  exploration: { emoji: '🗺️', label: 'Exploration', color: 'bg-green-500/10 text-green-600 border-green-200' },
  fun: { emoji: '🎉', label: 'Fun', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
  networking: { emoji: '🤝', label: 'Networking', color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  community: { emoji: '🏘️', label: 'Community', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-200' },
};

export function UserModeBadge({ mode, size = 'md' }: UserModeBadgeProps) {
  const config = modeConfig[mode as keyof typeof modeConfig];
  
  if (!config) return null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  return (
    <Badge 
      variant="outline" 
      className={`${config.color} ${sizeClasses[size]} font-medium flex items-center gap-1`}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </Badge>
  );
}