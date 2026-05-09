import { Link as RouterLink } from 'react-router';
import {
  Bell,
  X,
  Calendar,
  Newspaper,
  Clock,
  AlertTriangle,
  CloudRain,
  FileWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTripNudges, useDismissTripNudge, type TripNudge } from '@/hooks/useTripNudges';

interface Props {
  tripId: string;
}

const KIND_ICON: Record<TripNudge['kind'], typeof Bell> = {
  event_overlap: Calendar,
  news_alert: Newspaper,
  booking_reminder: Clock,
  weather_warning: CloudRain,
  document_expiry: FileWarning,
};

export function TripNudgesBanner({ tripId }: Props) {
  const { data: nudges, isLoading } = useTripNudges(tripId);
  const dismiss = useDismissTripNudge();

  if (isLoading || !nudges || nudges.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {nudges.map((n) => {
        const Icon = KIND_ICON[n.kind] ?? Bell;
        const tone =
          n.severity === 'critical'
            ? { bg: 'rgba(220, 38, 38, 0.08)', fg: '#dc2626' }
            : n.severity === 'warning'
              ? { bg: 'rgba(217, 119, 6, 0.08)', fg: '#b45309' }
              : { bg: 'hsl(var(--muted))', fg: 'hsl(var(--foreground))' };

        const isInternal = n.action_url?.startsWith('/');

        return (
          <div
            key={n.id}
            className="flex items-start gap-3 p-3"
            style={{ backgroundColor: tone.bg }}
          >
            <div className="flex items-center mt-0.5" style={{ color: tone.fg }}>
              {n.severity === 'critical' ? <AlertTriangle size={16} /> : <Icon size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{n.title}</p>
              {n.body && (
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {n.body}
                </span>
              )}
              {n.action_url && n.action_label && (
                isInternal ? (
                  <RouterLink
                    to={n.action_url}
                    className="inline-block mt-2 text-xs font-semibold hover:underline"
                    style={{ color: 'hsl(var(--foreground))', textDecoration: 'none' }}
                  >
                    {n.action_label} →
                  </RouterLink>
                ) : (
                  <a
                    href={n.action_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-semibold hover:underline"
                    style={{ color: 'hsl(var(--foreground))', textDecoration: 'none' }}
                  >
                    {n.action_label} →
                  </a>
                )
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss.mutate({ id: n.id, tripId })}
              disabled={dismiss.isPending}
              aria-label="Dismiss"
              className="h-7 w-7 p-0"
            >
              <X size={14} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
