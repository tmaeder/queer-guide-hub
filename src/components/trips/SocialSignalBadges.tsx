import { Heart, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { VenueSocialSignal } from '@/hooks/useVenueSocialSignals';

interface Props {
  signal: VenueSocialSignal | undefined;
  /** Minimum trip_usage before the "used in N trips" badge appears. */
  tripUsageThreshold?: number;
}

export function SocialSignalBadges({ signal, tripUsageThreshold = 3 }: Props) {
  const { t } = useTranslation();
  if (!signal) return null;
  const showFriends = signal.friends_saved > 0;
  const showTrips = signal.trip_usage >= tripUsageThreshold;
  if (!showFriends && !showTrips) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="inline-flex gap-1 items-center flex-wrap">
        {showFriends && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold"
                style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
              >
                <Heart size={10} fill="currentColor" />
                <span className="text-[11px] font-semibold">
                  {t('places.social.friendsSaved', {
                    defaultValue: '{{count}} friend(s) saved',
                    count: signal.friends_saved,
                  })}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('places.social.friendsSavedTooltip', { defaultValue: 'Saved by people you follow' })}
            </TooltipContent>
          </Tooltip>
        )}
        {showTrips && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-muted/40 text-muted-foreground">
                <Users size={10} />
                <span className="text-[11px] font-semibold">
                  {t('places.social.tripUsage', {
                    defaultValue: 'in {{count}} trip(s)',
                    count: signal.trip_usage,
                  })}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('places.social.tripUsageTooltip', { defaultValue: 'Added to public trips' })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
