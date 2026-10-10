import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Landmark, Search, Store } from 'lucide-react';
import { OccurrenceList, type Occurrence } from '@/components/transit/OccurrenceList';
import { FilterChip } from '@/components/transit/FilterChip';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/input';
import { getVenueVisual } from '@/lib/venueVisual';
import { useVenueCategoryOptions } from '@/lib/venueCategories';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
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
            label={option.label}
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

export function cityOccurrences(
  events: EventRelation[],
  locale: string,
  openLabel: string,
  timeZone?: string | null,
  untilLabel = 'Until',
): Occurrence[] {
  return events.map((e) => {
    const start = e.start_date ? new Date(e.start_date) : null;
    const end = e.end_date ? new Date(e.end_date) : null;
    const ongoing = start && end && start.getTime() <= Date.now() && end.getTime() > Date.now();
    const d = ongoing ? end : start;
    const title = localizedField(e.title, e.title_i18n as I18nMap, locale);
    return {
      id: e.id,
      date:
        d && !Number.isNaN(d.getTime())
          ? `${ongoing ? `${untilLabel} · ` : ''}${d
              .toLocaleDateString(locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                ...(d.getFullYear() !== new Date().getFullYear()
                  ? { year: 'numeric' as const }
                  : {}),
                ...(timeZone ? { timeZone } : {}),
              })
              .toUpperCase()}`
          : '',
      detail: e.venue_name ? `${title} · ${e.venue_name}` : title,
      status: e.is_free ? 'FREE' : undefined,
      action: e.slug ? (
        <LocalizedLink
          to={`/events/${e.slug}`}
          aria-label={title}
          className="inline-flex min-h-11 items-center rounded-element text-xs font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {openLabel}
          <ArrowUpRight aria-hidden="true" size={14} className="ml-1" />
        </LocalizedLink>
      ) : undefined,
    };
  });
}

export function CityEventsTab({
  events,
  locale,
  openLabel,
  timeZone,
}: {
  events: EventRelation[];
  locale: string;
  openLabel: string;
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
        matchesDepartureDate(e, date, now, zone),
    ),
    now,
  );
  const grouped = new Map<string, EventRelation[]>();
  for (const event of filtered) {
    const key = event.event_type || 'other';
    grouped.set(key, [...(grouped.get(key) || []), event]);
  }
  const displayedGroups = [...grouped].slice(0, type === 'all' ? Math.ceil(visible / 3) : 1);
  const shownCount = displayedGroups.reduce(
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
            <OccurrenceList
              floodFirst={false}
              className="overflow-hidden rounded-container bg-muted"
              occurrences={cityOccurrences(
                group.slice(0, type === 'all' ? 3 : visible),
                locale,
                openLabel,
                zone,
                t('cities.discovery.until', 'Until'),
              ).map((o) => ({
                ...o,
                status: o.status ? t('events.free', 'Free') : undefined,
              }))}
            />
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
        {(type === 'all' ? grouped.size > displayedGroups.length : filtered.length > visible) && (
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
