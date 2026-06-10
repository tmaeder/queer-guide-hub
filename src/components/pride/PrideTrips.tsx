import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

interface PrideTripsProps {
  events: PrideCalendarEvent[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

interface TripCluster {
  id: string;
  events: PrideCalendarEvent[];
  span: number;
  totalKm: number;
}

// Constraints that keep clusters realistic as multi-city pride trips
// (not sprawling chronological chains).
const MAX_DAYS_APART = 14; // leg-to-leg
const MAX_KM_BETWEEN = 1500; // leg-to-leg
const MAX_CHAIN_EVENTS = 4; // total prides in one trip
const MAX_TOTAL_SPAN_DAYS = 21; // start-to-end of trip
const MAX_TOTAL_KM = 4000; // sum across all legs

// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
export function buildClusters(events: PrideCalendarEvent[]): TripCluster[] {
  const geo = events.filter((e) => e.latitude != null && e.longitude != null);
  const sorted = [...geo].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );
  const seen = new Set<string>();
  const clusters: TripCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (seen.has(sorted[i].id)) continue;
    const chain: PrideCalendarEvent[] = [sorted[i]];
    let totalKm = 0;
    for (let j = i + 1; j < sorted.length && chain.length < MAX_CHAIN_EVENTS; j++) {
      const prev = chain[chain.length - 1];
      const cand = sorted[j];
      if (seen.has(cand.id)) continue;
      const days = Math.abs(
        (new Date(cand.start_date).getTime() - new Date(prev.start_date).getTime()) / 86_400_000,
      );
      if (days > MAX_DAYS_APART) break;
      const totalSpan = Math.abs(
        (new Date(cand.start_date).getTime() - new Date(chain[0].start_date).getTime()) /
          86_400_000,
      );
      if (totalSpan > MAX_TOTAL_SPAN_DAYS) break;
      const km = calculateDistanceKm(
        prev.latitude as number,
        prev.longitude as number,
        cand.latitude as number,
        cand.longitude as number,
      );
      if (km > MAX_KM_BETWEEN) continue;
      if (totalKm + km > MAX_TOTAL_KM) continue;
      chain.push(cand);
      totalKm += km;
    }
    if (chain.length >= 2) {
      chain.forEach((e) => seen.add(e.id));
      const span = Math.round(
        (new Date(chain[chain.length - 1].start_date).getTime() -
          new Date(chain[0].start_date).getTime()) /
          86_400_000,
      );
      clusters.push({ id: chain.map((e) => e.id).join('|'), events: chain, span, totalKm });
    }
  }

  clusters.sort((a, b) => {
    const af = a.events.filter((e) => e.is_featured).length;
    const bf = b.events.filter((e) => e.is_featured).length;
    if (af !== bf) return bf - af;
    if (a.events.length !== b.events.length) return b.events.length - a.events.length;
    return a.totalKm - b.totalKm;
  });

  return clusters.slice(0, 6);
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PrideTrips({ events, selectedId, onSelect }: PrideTripsProps) {
  const { t } = useTranslation();
  const clusters = useMemo(() => buildClusters(events), [events]);
  if (clusters.length === 0) return null;

  return (
    <section aria-labelledby="trips-heading">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-4">
        <h2 id="trips-heading" className="text-title font-medium">
          {t('pride.trips.title')}
        </h2>
        <span className="text-xs2 text-foreground/50">Up to 4 prides · within 21 days · &lt;4000&nbsp;km</span>
        <span className="text-xs2 text-foreground/50">{t('pride.trips.subtitle')}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {clusters.map((c) => (
          <article
            key={c.id}
            className="rounded-container border border-foreground/15 bg-background p-6 space-y-4"
          >
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-xs2 uppercase tracking-label text-foreground/60">
                {c.events.length} prides · {c.span} day{c.span === 1 ? '' : 's'}
                {c.totalKm > 0 && ` · ${Math.round(c.totalKm).toLocaleString()} km`}
                {c.totalKm > 0
                  ? t('pride.trips.metaWithKm', {
                      count: c.events.length,
                      days: c.span,
                      km: Math.round(c.totalKm).toLocaleString(),
                    })
                  : t('pride.trips.meta', { count: c.events.length, days: c.span })}
              </p>
              {c.events.some((e) => e.is_featured) && (
                <span className="text-2xs uppercase tracking-label text-foreground/60">{t('pride.trips.featured')}</span>
              )}
            </div>

            <ol className="space-y-2">
              {c.events.map((e, i) => {
                const isSelected = selectedId === e.id;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onSelect?.(isSelected ? null : e.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        'group flex w-full items-center gap-2 text-left min-h-0 p-2 rounded-element transition-colors',
                        isSelected ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="shrink-0 size-6 inline-flex items-center justify-center text-xs2 font-medium rounded-full border border-foreground/30 text-foreground/70 group-hover:border-foreground group-hover:text-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{e.title}</span>
                        <span className="block text-xs2 text-foreground/60">
                          {[e.city, e.country].filter(Boolean).join(', ')} · {formatShort(e.start_date)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link
                  to={`/trips?seed=${c.events.map((e) => e.id).join(',')}`}
                  aria-label={t('pride.trips.buildTrip') + ': ' + c.events.map((e) => e.city).filter(Boolean).join(' → ')}
                >
                  <Luggage className="size-3.5 mr-1.5" />
                  {t('pride.trips.buildTrip')}
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
