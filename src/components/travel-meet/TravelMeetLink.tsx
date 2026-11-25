import { useTranslation } from 'react-i18next';
import { Users, ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTripSafety } from '@/hooks/useTripSafety';
import { travelMeetHref, travelConnectionsAllowed, type TravelMeetContext } from '@/lib/travelMeet';

/** Contextual entry point. Reading it never publishes a trip or presence. */
export function TravelMeetLink({
  context,
  countryIds,
  label,
  compose = false,
}: {
  context: Partial<TravelMeetContext>;
  countryIds: string[];
  label?: string;
  /** Open the invitation composer on arrival; publishing still needs explicit consent there. */
  compose?: boolean;
}) {
  const { t } = useTranslation();
  const safety = useTripSafety(countryIds);
  if (!context.cityId || !travelConnectionsAllowed(safety)) return null;
  const href = travelMeetHref(context);
  return (
    <LocalizedLink
      to={compose ? `${href}${href.includes('?') ? '&' : '?'}compose=1` : href}
      className="my-4 flex min-h-11 items-center gap-4 rounded-element bg-surface-container px-4 py-4 text-sm font-semibold no-underline hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Users size={18} aria-hidden />
      <span className="min-w-0 flex-1">
        {label ?? t('travelMeet.tripLink', 'Want company for something during this trip?')}
      </span>
      <ArrowRight size={16} className="shrink-0" aria-hidden />
    </LocalizedLink>
  );
}
