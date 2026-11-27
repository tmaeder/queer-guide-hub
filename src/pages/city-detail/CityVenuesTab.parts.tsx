import { LayoutGrid, MapPin } from '@/components/icons';
import { VENUE_CATEGORY_ICONS } from '@/components/venues/venueCategoryIcon';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUpRight, Landmark, Search, Store } from '@/components/icons';
import { EventDateBadge } from '@/components/transit/EventDateBadge';
import { FilterChip } from '@/components/transit/FilterChip';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/input';
import { getVenueVisual } from '@/lib/venueVisual';
import { useVenueCategoryOptions } from '@/lib/venueCategories';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import { eventTiming, isLongRunning } from '@/lib/eventTiming';
import { cn } from '@/lib/utils';
import {
  matchesDepartureDate,
  sortDepartures,
  destinationTimezone,
  type DepartureWindow,
} from './cityDiscovery';
import type { VenueRelation, VillageRelation, EventRelation } from './types';

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 md:gap-x-6';
const CONTROL =
  'min-h-11 max-w-full rounded-element border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ACCENT = {
  venue: 'bg-track-pink text-ink',
  district: 'bg-track-green text-ink',
  event: 'bg-track-blue text-ink',
};

function StationBadge({ line }: { line: keyof typeof ACCENT }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full font-display text-lg ring-2 ring-ink',
        ACCENT[line],
      )}
    >
      {line === 'venue' ? 'V' : line === 'district' ? 'D' : 'E'}
    </span>
  );
}

function GalleryStop({
  href,
  name,
  detail,
  category,
  line,
  image,
}: {
  href?: string;
  name: string;
  detail?: string | null;
  category: string;
  line: 'venue' | 'district';
  image: ReactNode;
}) {
  const content = (
    <>
      <div className="relative overflow-hidden rounded-container">
        {image}
        <div className="absolute start-4 top-4">
          <StationBadge line={line} />
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-bold leading-snug md:text-lg">{name}</h3>
        {href && <ArrowUpRight aria-hidden="true" size={18} className="mt-0.5 shrink-0" />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{category}</p>
      {detail && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      )}
    </>
  );
  return href ? (
    <LocalizedLink
      to={href}
      className="group block min-w-0 rounded-container no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {content}
    </LocalizedLink>
  ) : (
    <div className="min-w-0">{content}</div>
  );
}

function ResultsFeedback({
  count,
  shown,
  reset,
  children,
}: {
  count: number;
  shown: number;
  reset?: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <p role="status" className="text-sm text-muted-foreground">
        {count === 0
          ? t('cities.discovery.noMatches', 'No matches. Try another filter.')
          : t('cities.discovery.showing', 'Showing {{shown}} of {{count}}', { shown, count })}
      </p>
      {reset && (
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-element px-4 text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('cities.discovery.reset', 'Reset filters')}
        </button>
      )}
      {children}
    </div>
  );
}

export function CityVenuesTab({ venues }: { venues: VenueRelation[] }) {
  const { t, i18n } = useTranslation();
  const categories = useVenueCategoryOptions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(6);
  const availableCategories = categories.filter((option) =>
    venues.some((v) => (v.category || 'other') === option.value),
  );
  const filtered = [...venues]
    .sort(
      (a, b) =>
        Number(Boolean(b.images?.[0] || b.logo_url)) - Number(Boolean(a.images?.[0] || a.logo_url)),
    )
    .filter((v) => {
      const name = localizedField(v.name, v.name_i18n as I18nMap, i18n.language);
      return (
        (category === 'all' || (v.category || 'other') === category) &&
        name
          .toLocaleLowerCase(i18n.language)
          .includes(search.trim().toLocaleLowerCase(i18n.language))
      );
    });
  const reset = () => {
    setSearch('');
    setCategory('all');
    setVisible(6);
  };
  if (venues.length === 0) return null;
  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute start-4 top-3.5 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('cities.discovery.searchPlaces', 'Search places')}
          placeholder={t('cities.discovery.searchPlaces', 'Search places')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(6);
          }}
          className="min-h-11 ps-10"
        />
      </div>
      <div
        role="group"
        aria-label={t('cities.discovery.placeType', 'Place type')}
        className="mb-6 flex gap-2 overflow-x-auto px-1 pb-2 pt-1"
      >
        {[
          { value: 'all', label: t('cities.discovery.allPlaces', 'All places') },
          ...availableCategories,
        ].map((option) => (
          <FilterChip
            key={option.value}
            active={category === option.value}
            label={
              <>
                {(() => {
                  const Icon =
                    option.value === 'all'
                      ? LayoutGrid
                      : (VENUE_CATEGORY_ICONS[option.value as keyof typeof VENUE_CATEGORY_ICONS] ??
                        MapPin);
                  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
                })()}
                {option.label}
              </>
            }
            className={
              category === option.value
                ? 'bg-track-pink text-ink hover:bg-track-pink hover:text-ink'
                : 'bg-muted'
            }
            onClick={() => {
              setCategory(option.value);
              setVisible(6);
            }}
          />
        ))}
      </div>
      <div className={GRID} data-testid="city-place-gallery">
        {filtered.slice(0, visible).map((v) => {
          const visual = v.images?.[0]
            ? { src: v.images[0], fit: 'cover' as const, plate: null }
            : getVenueVisual(v);
          const name = localizedField(v.name, v.name_i18n as I18nMap, i18n.language);
          return (
            <GalleryStop
              key={v.id}
              href={v.slug ? `/venues/${v.slug}` : undefined}
              name={name}
              category={
                categories.find((c) => c.value === (v.category || 'other'))?.label ||
                t('venueCategories.other', 'Other')
              }
              line="venue"
              image={
                <Image
                  src={visual.src}
                  fit={visual.fit}
                  plate={visual.plate ?? undefined}
                  alt={name}
                  aspect="card"
                  imageRole="cover"
                  sizes="(min-width: 768px) 30vw, 45vw"
                  fallbackIcon={Store}
                />
              }
            />
          );
        })}
      </div>
      <ResultsFeedback
        count={filtered.length}
        shown={Math.min(visible, filtered.length)}
        reset={search || category !== 'all' ? reset : undefined}
      >
        {filtered.length > visible && (
          <FilterChip
            active={false}
            label={t('cities.discovery.morePlaces', 'More places')}
            onClick={() => setVisible((n) => n + 6)}
          />
        )}
      </ResultsFeedback>
    </div>
  );
}

export function CityDistricts({ villages }: { villages: VillageRelation[] }) {
  const { t, i18n } = useTranslation();
  if (villages.length === 0) return null;
  return (
    <div className={GRID} data-testid="city-district-gallery">
      {villages.map((v) => {
        const name = localizedField(v.name, v.name_i18n as I18nMap, i18n.language);
        return (
          <GalleryStop
            key={v.id}
            href={v.slug ? `/villages/${v.slug}` : undefined}
            name={name}
            category={t('cities.discovery.district', 'Queer district')}
            detail={localizedField(v.description, v.description_i18n as I18nMap, i18n.language)}
            line="district"
            image={
              <Image
                src={v.curated_image_url || (!v.image_flagged ? v.image_url : null)}
                alt={name}
                aspect="card"
                imageRole="cover"
                sizes="(min-width: 768px) 30vw, 45vw"
                fallbackIcon={Landmark}
              />
            }
          />
        );
      })}
    </div>
  );
}

/**
 * City events as departure rows, the same shape as the homepage board: date
 * disc, bold title, venue below, the whole row a link, Free as a quiet tag.
 */
function CityEventRows({
  events,
  timeZone,
}: {
  events: EventRelation[];
  timeZone?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [now] = useState(() => Date.now());
  if (!events.length) return null;
  return (
    <ul className="m-0 list-none divide-y divide-border-hairline overflow-hidden rounded-container bg-card p-0 shadow-soft">
      {events.map((e) => {
        const title = localizedField(e.title, e.title_i18n as I18nMap, i18n.language);
        // An event already running shows its END date with "Until", never a
        // historical start presented as an upcoming departure.
        const ongoing =
          !!e.end_date &&
          eventTiming(
            { start_date: e.start_date, end_date: e.end_date, timezone: timeZone },
            now,
          ) === 'ongoing';
        const shown = ongoing ? e.end_date : e.start_date;
        const body = (
          <>
            {shown ? (
              <EventDateBadge startDate={shown} locale={i18n.language} timeZone={timeZone} />
            ) : (
              <span className="size-16 shrink-0" aria-hidden />
            )}
            <span className="min-w-0">
              {ongoing && (
                <span className="block text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {t('cities.discovery.until', 'Until')}
                </span>
              )}
              <span className="block truncate text-15 font-bold">{title}</span>
              {e.venue_name && (
                <span className="block truncate text-13 text-muted-foreground">{e.venue_name}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {e.is_free && (
                <span className="rounded-badge bg-muted px-2 py-0.5 text-2xs font-bold">
                  {t('events.free', 'Free')}
                </span>
              )}
              {e.slug && <ArrowRight size={18} aria-hidden className="rtl:rotate-180" />}
            </span>
          </>
        );
        const row =
          'grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 no-underline';
        return (
          <li key={e.id}>
            {e.slug ? (
              <LocalizedLink
                to={`/events/${e.slug}`}
                className={cn(row, 'hover:bg-surface-container focus-visible:-outline-offset-2')}
              >
                {body}
              </LocalizedLink>
            ) : (
              <div className={row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CityEventsTab({
  events,
  timeZone,
}: {
  events: EventRelation[];
  /** Unused since rows read the i18n locale; kept so callers need no change. */
  locale?: string;
  timeZone?: string | null;
}) {
  const { t } = useTranslation();
  const types = useEventTypeOptions();
  const [type, setType] = useState('all');
  const [date, setDate] = useState<DepartureWindow>('upcoming');
  const [free, setFree] = useState(false);
  const [visible, setVisible] = useState(12);
  const now = new Date();
  const zone = destinationTimezone(timeZone);
  const filtered = sortDepartures(
    events.filter(
      (e) =>
        (type === 'all' || (e.event_type || 'other') === type) &&
        (!free || e.is_free === true) &&
        matchesDepartureDate(e, date, now, zone) &&
        // A standing schedule stored as one multi-year span is not a departure.
        !isLongRunning(e, now.getTime()),
    ),
    now,
  );
  const grouped = new Map<string, EventRelation[]>();
  for (const event of filtered) {
    const key = event.event_type || 'other';
    grouped.set(key, [...(grouped.get(key) || []), event]);
  }
  // Grouping by type only helps when a type has more than one event. When
  // every group would hold one (Columbus: "Other 1", "Pride 1", "Festival 1")
  // a heading per event is just noise, so the list renders flat, in date order.
  const flat = type === 'all' && [...grouped.values()].every((g) => g.length === 1);
  const displayedGroups = flat
    ? []
    : [...grouped].slice(0, type === 'all' ? Math.ceil(visible / 3) : 1);
  const shownCount = flat
    ? Math.min(filtered.length, visible)
    : displayedGroups.reduce(
        (sum, [, group]) => sum + Math.min(group.length, type === 'all' ? 3 : visible),
        0,
      );
  const reset = () => {
    setType('all');
    setDate('upcoming');
    setFree(false);
    setVisible(12);
  };
  if (events.length === 0) return null;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold">
          {t('cities.discovery.when', 'When')}
          <select
            className={CONTROL}
            value={date}
            onChange={(e) => {
              setDate(e.target.value as DepartureWindow);
              setVisible(12);
            }}
          >
            <option value="upcoming">{t('cities.discovery.upcoming', 'Upcoming')}</option>
            <option value="today">{t('cities.discovery.today', 'Today')}</option>
            <option value="weekend">{t('cities.discovery.weekend', 'This weekend')}</option>
            <option value="week">{t('cities.discovery.week', 'Next 7 days')}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold">
          {t('cities.discovery.eventType', 'Event type')}
          <select
            className={CONTROL}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setVisible(12);
            }}
          >
            <option value="all">{t('cities.discovery.allTypes', 'All types')}</option>
            {types
              .filter((option) => events.some((e) => (e.event_type || 'other') === option.value))
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </label>
        <FilterChip
          active={free}
          label={t('cities.discovery.freeOnly', 'Free only')}
          className={
            free ? 'bg-track-blue text-ink hover:bg-track-blue hover:text-ink' : 'bg-muted'
          }
          onClick={() => {
            setFree((v) => !v);
            setVisible(12);
          }}
        />
      </div>
      {flat && filtered.length > 0 && (
        <CityEventRows events={filtered.slice(0, visible)} timeZone={zone} />
      )}
      <div className="space-y-6" data-testid="city-departure-groups">
        {displayedGroups.map(([key, group]) => (
          <section
            key={key}
            aria-label={
              types.find((option) => option.value === key)?.label || t('eventTypes.other', 'Other')
            }
          >
            <h3 className="mb-4 flex items-center gap-4 text-lg font-bold">
              <StationBadge line="event" />
              {types.find((option) => option.value === key)?.label ||
                t('eventTypes.other', 'Other')}
              <span className="text-sm font-normal text-muted-foreground">{group.length}</span>
            </h3>
            <CityEventRows events={group.slice(0, type === 'all' ? 3 : visible)} timeZone={zone} />
            {type === 'all' && group.length > 3 && (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-element px-4 text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  setType(key);
                  setVisible(12);
                }}
              >
                {t('cities.discovery.moreEvents', 'More departures')}
                <span className="sr-only">
                  :{' '}
                  {types.find((option) => option.value === key)?.label ||
                    t('eventTypes.other', 'Other')}
                </span>
              </button>
            )}
          </section>
        ))}
      </div>
      <ResultsFeedback
        count={filtered.length}
        shown={shownCount}
        reset={type !== 'all' || date !== 'upcoming' || free ? reset : undefined}
      >
        {(flat
          ? filtered.length > visible
          : type === 'all'
            ? grouped.size > displayedGroups.length
            : filtered.length > visible) && (
          <FilterChip
            active={false}
            label={
              type === 'all'
                ? t('cities.discovery.moreTypes', 'More event types')
                : t('cities.discovery.moreEvents', 'More departures')
            }
            onClick={() => setVisible((n) => n + 12)}
          />
        )}
      </ResultsFeedback>
    </div>
  );
}
