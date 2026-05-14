import { useTranslation } from 'react-i18next';
import { Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEmptyStateSuggestions } from '@/hooks/useEmptyStateSuggestions';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

interface SmartEmptyStateProps {
  city?: string;
  dateRange?: { start: string; end: string };
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onClearCity?: () => void;
  onClearDate?: () => void;
}

export function SmartEmptyState({
  city,
  dateRange,
  hasActiveFilters,
  onClearFilters,
  onClearCity,
  onClearDate,
}: SmartEmptyStateProps) {
  const { t, i18n } = useTranslation();
  const dfLocale = dateFnsLocaleFor(i18n.language);
  const { suggestions } = useEmptyStateSuggestions({
    enabled: hasActiveFilters,
    city,
    dateRange,
  });

  const { sameCityDifferentDate, otherCitiesSameDate, fallback } = suggestions;
  const primary =
    sameCityDifferentDate.length > 0
      ? { events: sameCityDifferentDate, kind: 'sameCity' as const }
      : otherCitiesSameDate.length > 0
        ? { events: otherCitiesSameDate, kind: 'otherCities' as const }
        : fallback.length > 0
          ? { events: fallback, kind: 'fallback' as const }
          : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-10 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t('pages.events.smartEmpty.title', 'No events match your filters')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl">
          {t(
            'pages.events.smartEmpty.body',
            'Try one of the suggestions below, or clear filters to browse everything.',
          )}
        </p>
      </div>

      {/* Quick-fix actions */}
      <div className="flex flex-wrap gap-2">
        {city && onClearCity && (
          <Button variant="outline" size="sm" onClick={onClearCity}>
            {t('pages.events.smartEmpty.clearCity', { city, defaultValue: `Drop "${city}" filter` })}
          </Button>
        )}
        {dateRange && onClearDate && (
          <Button variant="outline" size="sm" onClick={onClearDate}>
            {t('pages.events.smartEmpty.clearDate', 'Drop date filter')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          {t('pages.events.smartEmpty.viewAll', 'View all upcoming events')}
        </Button>
      </div>

      {/* Suggestions */}
      {primary && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {primary.kind === 'sameCity' && city
              ? t('pages.events.smartEmpty.sameCityHeader', { city, defaultValue: `Try in ${city} on other dates` })
              : primary.kind === 'otherCities'
                ? t('pages.events.smartEmpty.otherCitiesHeader', 'Try other cities in your date range')
                : t('pages.events.smartEmpty.fallbackHeader', 'Other upcoming events')}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {primary.events.map((event) => (
              <SuggestionRow key={event.id} event={event} dfLocale={dfLocale} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface SuggestionRowProps {
  event: Event;
  dfLocale: ReturnType<typeof dateFnsLocaleFor>;
}

function SuggestionRow({ event, dfLocale }: SuggestionRowProps) {
  const start = new Date(event.start_date);
  const dateLabel = format(start, 'MMM d, yyyy', { locale: dfLocale });
  return (
    <li>
      <LocalizedLink
        to={`/events/${event.slug}`}
        className="group flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/50"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{event.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {dateLabel}
            {event.city ? ` · ${event.city}` : ''}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </LocalizedLink>
    </li>
  );
}
