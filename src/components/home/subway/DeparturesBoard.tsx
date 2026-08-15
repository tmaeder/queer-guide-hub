import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Band } from '@/components/home/Band';
import { RegionChip } from '@/components/home/RegionChip';
import { useHomeRegionContext } from '@/components/home/HomeRegionProvider';
import { useHomeNearYou, type NearYouRow } from '@/hooks/useHomeNearYou';

const ROWS = 6;

const formatBoardTime = (iso: string | null, locale: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  // All-day rows (midnight timestamps) read as a date, not a fake 00:00.
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return time === '00:00' ? `${day} ${date}` : `${day} ${time}`;
};

function BoardRow({ row, locale }: { row: NearYouRow; locale: string }) {
  const href = row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <div className="group relative border-b-2 border-foreground/10 last:border-b-0">
      <div className="grid grid-cols-[42px_1fr_auto] items-center gap-4 px-4 py-4 transition-colors group-hover:bg-surface-container md:grid-cols-[52px_120px_1fr_28px] md:px-6">
        <RouteBullet type={row.kind} size={42} />
        <span className="hidden text-body-lg font-bold tabular-nums md:block">
          {row.kind === 'event' ? formatBoardTime(row.startDate, locale) : '—'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-title font-bold md:text-headline">{row.title}</span>
          <span className="mt-0.5 block truncate text-13 text-muted-foreground">
            {row.kind === 'event' && (
              <span className="md:hidden">{formatBoardTime(row.startDate, locale)} · </span>
            )}
            {row.via}
          </span>
        </span>
        <span className="hidden text-xl font-bold md:block" aria-hidden>
          →
        </span>
      </div>
      <LocalizedLink to={href} className="absolute inset-0 no-underline" aria-label={row.title} />
    </div>
  );
}

/**
 * "Near you" — what is on where the visitor actually is.
 *
 * Two rules make this honest rather than merely local:
 *
 *  1. The heading names the scope it reached ("Departures — Berlin" /
 *     "— Germany" / "— across the network"), so the page never claims
 *     proximity it did not achieve. The word "Departures" stays in every
 *     variant — the homepage e2e asserts on it.
 *  2. When the region runs dry, the fill is separated by a rule and an
 *     eyebrow rather than blended in. Ink only: a track colour here would
 *     encode "farther away", and track colours may never encode a state.
 *
 * It never self-hides. A band that returns null is indistinguishable from a
 * broken query — which is exactly why the e2e spec asserts this heading is
 * always present — so an empty region renders the chrome and says so plainly.
 */
export function DeparturesBoard() {
  const { t, i18n } = useTranslation();
  const region = useHomeRegionContext();
  const { data, isLoading } = useHomeNearYou(region, ROWS);

  const rows = data?.rows ?? [];
  const local = rows.filter((r) => r.rung === 'local');
  const trip = rows.filter((r) => r.rung === 'trip');

  const title =
    data?.scope === 'city' && region.cityName
      ? t('home.departures.titleCity', 'Departures — {{city}}', { city: region.cityName })
      : data?.scope === 'country' && region.countryName
        ? t('home.departures.titleCountry', 'Departures — {{country}}', {
            country: region.countryName,
          })
        : t('home.departures.titleNetwork', 'Departures — across the network');

  return (
    <Band
      surface="tint"
      title={isLoading ? t('home.departures.title', 'Departures — this week') : title}
      seeAllHref="/events"
      seeAllLabel={t('home.departures.seeAll', 'Full board')}
      action={<RegionChip region={region} />}
    >
      <div className="border-[3px] border-foreground bg-background">
        {isLoading ? (
          // Skeletons at the loaded row's real height (a two-line title/via
          // stack at py-4), not a flat h-16 that is shorter than the content
          // it stands in for — that difference is a homepage CLS source.
          Array.from({ length: ROWS }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse border-b-2 border-foreground/10 last:border-b-0" />
          ))
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-15 text-muted-foreground md:px-6">
            {t('home.departures.empty', 'Nothing on the board we can see right now.')}
          </p>
        ) : (
          <>
            {local.map((r) => (
              <BoardRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
            ))}
            {trip.length > 0 && (
              <>
                {local.length > 0 && (
                  <div className="border-t-4 border-foreground px-4 py-2 md:px-6">
                    <Eyebrow as="div">{t('home.departures.worthTheTrip', 'Worth the trip')}</Eyebrow>
                  </div>
                )}
                {trip.map((r) => (
                  <BoardRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </Band>
  );
}
