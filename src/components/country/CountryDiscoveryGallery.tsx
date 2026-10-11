import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useVenueCategoryOptions, VENUE_CATEGORY_OPTIONS } from '@/lib/venueCategories';
import { useEventTypeOptions, EVENT_TYPE_OPTIONS } from '@/lib/eventTypes';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TrackLoader } from '@/components/transit/TrackLoader';
import {
  fetchCountryDiscovery,
  EMPTY_DISCOVERY_FILTERS,
  DISCOVERY_PAGE_SIZE,
  type DiscoveryKind,
  type DiscoveryFilters,
  type DiscoveryItem,
} from '@/hooks/useCountryDiscoveryGallery';

export function DiscoveryPhotoCard({
  item,
  kind,
}: {
  item: DiscoveryItem;
  kind: 'city' | DiscoveryKind;
}) {
  const { t, i18n } = useTranslation();
  const categoryLabel =
    (kind === 'venue' ? VENUE_CATEGORY_OPTIONS : EVENT_TYPE_OPTIONS).find(
      (option) => option.value === item.category,
    )?.label ?? item.category;
  const date = item.start ? new Date(item.start) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
      : null;
  return (
    <LocalizedLink
      to={item.href}
      aria-label={item.name}
      className="group block min-w-0 rounded-container bg-surface-container p-2 no-underline transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative overflow-hidden rounded-element">
        <Image
          src={item.image}
          alt=""
          aspect="card"
          imageRole="cover"
          rounded="element"
          fit={item.isLogo ? 'contain' : 'cover'}
          plate={item.isLogo ? 'paper' : undefined}
          fallbackIcon={kind === 'event' ? Calendar : MapPin}
          referrerPolicy="no-referrer"
        />
        <div className="absolute start-2 top-2">
          <RouteBullet type={kind} size={32} />
        </div>
        {dateLabel && (
          <span className="absolute bottom-2 start-2 rounded-badge bg-background px-2 py-1 text-13 font-bold tabular-nums">
            {dateLabel}
          </span>
        )}
      </div>
      <div className="px-2 pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-body-lg font-bold leading-tight sm:text-title">{item.name}</h3>
          <ArrowUpRight
            size={16}
            aria-hidden
            className="mt-1 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
          />
        </div>
        {item.city && <p className="mt-2 text-13 text-muted-foreground">{item.city}</p>}
        {kind !== 'city' && (
          <p className="mt-2 text-xs2 font-bold text-muted-foreground">
            {t(
              `${kind === 'venue' ? 'venueCategories' : 'eventTypes'}.${item.category}`,
              categoryLabel,
            )}
          </p>
        )}
        {item.free && <p className="mt-2 text-13 font-bold">{t('events.free', 'Free')}</p>}
      </div>
    </LocalizedLink>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2 text-13 font-medium">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) && child.type !== 'datalist'
          ? cloneElement(child as ReactElement<{ id?: string }>, { id })
          : child,
      )}
    </div>
  );
}
const SELECT =
  'h-12 w-full min-w-0 rounded-element border border-input bg-background px-4 text-13 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CountryDiscoveryGallery({
  countryId,
  kind,
  cities,
}: {
  countryId: string;
  kind: DiscoveryKind;
  cities: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const venueCategories = useVenueCategoryOptions();
  const eventTypes = useEventTypeOptions();
  const categories = kind === 'venue' ? venueCategories : eventTypes;
  const [filters, setFilters] = useState(EMPTY_DISCOVERY_FILTERS);
  const [page, setPage] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const deferredFilters = useDebounce(filters, 300);
  const update = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  };
  const reset = () => {
    setFilters(EMPTY_DISCOVERY_FILTERS);
    setPage(0);
  };
  const invalidDates = !!filters.from && !!filters.until && filters.from > filters.until;
  const query = useQuery({
    queryKey: ['country-discovery', countryId, kind, deferredFilters, page],
    queryFn: () => fetchCountryDiscovery(kind, countryId, deferredFilters, page),
    enabled:
      !!countryId &&
      !(
        deferredFilters.from &&
        deferredFilters.until &&
        deferredFilters.from > deferredFilters.until
      ),
    staleTime: 60_000,
  });
  const active = Object.entries(filters).filter(
    ([key, value]) => key !== 'sort' && key !== 'cityId' && !!value,
  ).length;
  const total = query.data?.total ?? 0;
  return (
    <div>
      <div className="mb-6 rounded-container bg-surface-container p-4">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label={t('common.search', 'Search')}>
            <Input
              type="search"
              className="h-12 bg-background"
              value={filters.search}
              onChange={(e) => update('search', e.target.value)}
            />
          </Field>
          <Field label={t('pages.events.city', 'City')}>
            <Input
              type="search"
              list={`${kind}-country-cities`}
              className="h-12 bg-background"
              value={filters.city}
              placeholder={t('home.allCities', 'All cities')}
              onChange={(e) => {
                const name = e.target.value;
                const match = cities.find(
                  (city) => city.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
                );
                setFilters((current) => ({ ...current, city: name, cityId: match?.id ?? '' }));
                setPage(0);
              }}
            />
            <datalist id={`${kind}-country-cities`}>
              {cities.map((city) => (
                <option key={city.id} value={city.name} />
              ))}
            </datalist>
          </Field>
          <Field label={t('pages.venues.sortCategory', 'Category')}>
            <select
              className={SELECT}
              value={filters.category}
              onChange={(e) => update('category', e.target.value)}
            >
              <option value="">{t('country.gallery.allTypes', 'All types')}</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="outline"
            className="min-h-12"
            aria-expanded={advanced}
            aria-controls={`${kind}-gallery-filters`}
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={16} aria-hidden />
            {t('search.filters', 'Filters')}
            {active ? ` (${active})` : ''}
          </Button>
        </div>
        <div
          id={`${kind}-gallery-filters`}
          hidden={!advanced}
          className="mt-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label={t('search.sortBy', 'Sort By')}>
            <select
              className={SELECT}
              value={filters.sort}
              onChange={(e) => update('sort', e.target.value)}
            >
              {kind === 'venue' ? (
                <>
                  <option value="">{t('pages.venues.sortFeatured', 'Featured')}</option>
                  <option value="name">{t('pages.venues.sortName', 'Name')}</option>
                </>
              ) : (
                <>
                  <option value="">{t('pages.events.sort.dateAsc', 'Soonest first')}</option>
                  <option value="date-desc">
                    {t('pages.events.sort.dateDesc', 'Latest first')}
                  </option>
                  <option value="recent">{t('pages.events.sort.recent', 'Recently added')}</option>
                </>
              )}
            </select>
          </Field>
          {kind === 'venue' ? (
            <>
              <Field label={t('venues.quickFilters.price', 'Price')}>
                <select
                  className={SELECT}
                  value={filters.price}
                  onChange={(e) => update('price', e.target.value)}
                >
                  <option value="">{t('venues.quickFilters.anyPrice', 'Any price')}</option>
                  {[1, 2, 3, 4].map((price) => (
                    <option key={price} value={price}>
                      {'$'.repeat(price)}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex min-h-12 items-center gap-2 text-13">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-foreground"
                  checked={filters.verified}
                  onChange={(e) => update('verified', e.target.checked)}
                />
                {t('country.gallery.verifiedOnly', 'Verified venues only')}
              </label>
            </>
          ) : (
            <>
              <Field label={t('trips.dialog.create.startDate', 'Start date')}>
                <Input
                  type="date"
                  className="h-12 bg-background"
                  value={filters.from}
                  onChange={(e) => update('from', e.target.value)}
                />
              </Field>
              <Field label={t('trips.dialog.create.endDate', 'End date')}>
                <Input
                  type="date"
                  className="h-12 bg-background"
                  value={filters.until}
                  min={filters.from || undefined}
                  onChange={(e) => update('until', e.target.value)}
                />
              </Field>
              <label className="flex min-h-12 items-center gap-2 text-13">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-foreground"
                  checked={filters.free}
                  onChange={(e) => update('free', e.target.checked)}
                />
                {t('country.gallery.freeOnly', 'Free events only')}
              </label>
            </>
          )}
        </div>
        {active > 0 && (
          <Button variant="ghost" className="mt-4" onClick={reset}>
            {t('common.resetFilters', 'Reset filters')}
          </Button>
        )}
      </div>
      <div aria-live="polite" aria-busy={query.isFetching}>
        {invalidDates ? (
          <p className="py-8 text-13">
            {t('country.gallery.invalidDates', 'Choose an end date after the start date.')}
          </p>
        ) : query.isError ? (
          <div className="py-8">
            <p>{t('country.gallery.error', 'This collection could not be loaded.')}</p>
            <Button className="mt-4" onClick={() => void query.refetch()}>
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        ) : query.isPending ? (
          <TrackLoader label={t('common.loading', 'Loading')} />
        ) : (
          <>
            <p className="mb-4 text-13 text-muted-foreground">
              {t('country.gallery.results', '{{count}} results', { count: total })}
            </p>
            {query.data?.items.length ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {query.data.items.map((item) => (
                  <DiscoveryPhotoCard key={item.id} item={item} kind={kind} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-13">
                {t('country.gallery.empty', 'No matches. Try another city or reset your filters.')}
              </p>
            )}
            {total > DISCOVERY_PAGE_SIZE && (
              <nav
                className="mt-6 flex items-center justify-between gap-4"
                aria-label={`${t(kind === 'venue' ? 'breadcrumb.venues' : 'breadcrumb.events')} — ${t('country.gallery.pagination', 'Gallery pages')}`}
              >
                <Button
                  variant="outline"
                  disabled={page === 0 || query.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  {t('cruising.pagination.previous', 'Previous')}
                </Button>
                <span className="text-13 tabular-nums">
                  {page + 1} / {Math.ceil(total / DISCOVERY_PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * DISCOVERY_PAGE_SIZE >= total || query.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  {t('cruising.pagination.next', 'Next')}
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
