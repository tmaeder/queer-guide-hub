import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Heart,
  MapPin,
  Megaphone,
  MessageSquare,
  PencilLine,
  Plane,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { eventIcon, eventLabel } from '@/lib/activityLabels';

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Heart,
  MapPin,
  Megaphone,
  MessageSquare,
  PencilLine,
  Plane,
  Sparkles,
  UserPlus,
  Users,
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ActivityStripProps {
  className?: string;
  limit?: number;
}

/**
 * Compact activity feed for own profile. Reads from user_activity_events
 * (self-RLS only — never reveals other users' activity). Live via Realtime.
 */
export function ActivityStrip({ className, limit = 8 }: ActivityStripProps) {
  const { events, loading } = useRecentActivity(limit);

  if (loading) {
    return (
      <div className={cn('h-24 rounded-container border border-border bg-card animate-pulse', className)} />
    );
  }

  if (events.length === 0) {
    return (
      <div
        className={cn(
          'rounded-container border border-border bg-card p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        No activity yet.
      </div>
    );
  }

  return (
    <section
      className={cn('rounded-container border border-border bg-card p-4', className)}
      aria-label="Recent activity"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Recent activity</h3>
        <span className="text-13 text-muted-foreground">last {events.length}</span>
      </div>
      <ol className="space-y-2">
        {events.map((ev) => {
          const Icon = ICON_MAP[eventIcon(ev.event_type)] ?? Activity;
          return (
            <li key={ev.id} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm text-foreground">{eventLabel(ev.event_type)}</p>
                  <span className="shrink-0 text-13 tabular-nums text-muted-foreground">
                    {relativeTime(ev.created_at)}
                  </span>
                </div>
                {ev.points_delta > 0 && (
                  <p className="text-13 text-muted-foreground tabular-nums">+{ev.points_delta} pts</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
