import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { X, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { displayCityName } from '@/utils/cityDisplay';
import type { EventPresetId } from '@/components/events/PresetChips';

/** One dismissible filter chip. Encapsulates the repeated Badge + `×` markup
 *  (the `×` keeps the same negative-margin hit-target the page used inline). */
function FilterPill({
  children,
  onClear,
  clearLabel,
}: {
  children: ReactNode;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <Badge variant="secondary" className="inline-flex items-center gap-1">
      {children}
      <X
        size={12}
        style={{ margin: -8, boxSizing: 'content-box' }}
        className="cursor-pointer p-2"
        role="button"
        aria-label={clearLabel}
        onClick={onClear}
      />
    </Badge>
  );
}

export interface EventActiveFiltersProps {
  search: string;
  cities: string[];
  eventTypes: string[];
  startDate?: Date;
  endDate?: Date;
  nearMe: boolean;
  showPast: boolean;
  isFree: boolean;
  featuredOnly: boolean;
  ageRestriction: string;
  selectedTags: string[];
  autoLocationLabel: string | null;
  activePreset: EventPresetId | null;
  setSearch: Dispatch<SetStateAction<string>>;
  setCities: Dispatch<SetStateAction<string[]>>;
  setAutoLocationLabel: Dispatch<SetStateAction<string | null>>;
  setEventTypes: Dispatch<SetStateAction<string[]>>;
  setStartDate: Dispatch<SetStateAction<Date | undefined>>;
  setEndDate: Dispatch<SetStateAction<Date | undefined>>;
  setNearMe: Dispatch<SetStateAction<boolean>>;
  setShowPast: Dispatch<SetStateAction<boolean>>;
  setIsFree: Dispatch<SetStateAction<boolean>>;
  setFeaturedOnly: Dispatch<SetStateAction<boolean>>;
  setActivePreset: Dispatch<SetStateAction<EventPresetId | null>>;
  setAgeRestriction: Dispatch<SetStateAction<string>>;
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
}

/** The "Active filters:" chip row shown when filters are applied but the
 *  full filter panel is collapsed. Pure presentation over the page's filter
 *  state — clearing a chip calls the matching setter, which the page's
 *  effects observe to refetch. */
export function EventActiveFilters(props: EventActiveFiltersProps) {
  const { t, i18n } = useTranslation();
  const dfLocale = dateFnsLocaleFor(i18n.language);
  const {
    search,
    cities,
    eventTypes,
    startDate,
    endDate,
    nearMe,
    showPast,
    isFree,
    featuredOnly,
    ageRestriction,
    selectedTags,
    autoLocationLabel,
    activePreset,
    setSearch,
    setCities,
    setAutoLocationLabel,
    setEventTypes,
    setStartDate,
    setEndDate,
    setNearMe,
    setShowPast,
    setIsFree,
    setFeaturedOnly,
    setActivePreset,
    setAgeRestriction,
    setSelectedTags,
  } = props;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <p className="text-sm text-muted-foreground">
        {t('pages.events.activeFilters', 'Active filters:')}
      </p>
      {search && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterSearch', 'Clear search')}
          onClear={() => setSearch('')}
        >
          {t('pages.events.filterSearch', { value: search, defaultValue: `Search: ${search}` })}
        </FilterPill>
      )}
      {cities.map((c) => (
        <FilterPill
          key={c}
          clearLabel={t('pages.events.clearFilterCity', 'Clear city filter')}
          onClear={() => {
            setCities((prev) => prev.filter((x) => x !== c));
            if (autoLocationLabel === c) setAutoLocationLabel(null);
          }}
        >
          {autoLocationLabel === c && <MapPin size={10} />}
          {autoLocationLabel === c
            ? t('pages.events.filterNearYou', {
                value: displayCityName(c, i18n.language),
                defaultValue: `Near you: ${displayCityName(c, i18n.language)}`,
              })
            : t('pages.events.filterCity', {
                value: displayCityName(c, i18n.language),
                defaultValue: `City: ${displayCityName(c, i18n.language)}`,
              })}
        </FilterPill>
      ))}
      {eventTypes.map((t2) => (
        <FilterPill
          key={t2}
          clearLabel={t('pages.events.clearFilterEventType', 'Clear event type filter')}
          onClear={() => setEventTypes((prev) => prev.filter((x) => x !== t2))}
        >
          {t2}
        </FilterPill>
      ))}
      {startDate && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterStartDate', 'Clear start date filter')}
          onClear={() => setStartDate(undefined)}
        >
          {t('pages.events.filterFrom', {
            value: format(startDate, 'PP', { locale: dfLocale }),
            defaultValue: `From: ${format(startDate, 'PP', { locale: dfLocale })}`,
          })}
        </FilterPill>
      )}
      {endDate && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterEndDate', 'Clear end date filter')}
          onClear={() => setEndDate(undefined)}
        >
          {t('pages.events.filterTo', {
            value: format(endDate, 'PP', { locale: dfLocale }),
            defaultValue: `To: ${format(endDate, 'PP', { locale: dfLocale })}`,
          })}
        </FilterPill>
      )}
      {nearMe && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterNearMe', 'Clear near me filter')}
          onClear={() => setNearMe(false)}
        >
          {t('pages.events.filterNearMe', 'Near Me')}
        </FilterPill>
      )}
      {showPast && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterPast', 'Clear past events filter')}
          onClear={() => setShowPast(false)}
        >
          {t('pages.events.pastEvents', 'Past events')}
        </FilterPill>
      )}
      {/* D13: pills for boolean filters that previously had no pill.
          Clearing flips the matching preset chip back to inactive. */}
      {isFree && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterFree', 'Clear free filter')}
          onClear={() => {
            setIsFree(false);
            if (activePreset === 'free') setActivePreset(null);
          }}
        >
          {t('pages.events.filterFree', 'Free')}
        </FilterPill>
      )}
      {featuredOnly && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterFeatured', 'Clear featured filter')}
          onClear={() => {
            setFeaturedOnly(false);
            if (activePreset === 'featured') setActivePreset(null);
          }}
        >
          {t('pages.events.filterFeatured', 'Featured')}
        </FilterPill>
      )}
      {ageRestriction && (
        <FilterPill
          clearLabel={t('pages.events.clearFilterAge', 'Clear age filter')}
          onClear={() => setAgeRestriction('')}
        >
          {t('pages.events.filterAge', { value: ageRestriction, defaultValue: `Age: ${ageRestriction}` })}
        </FilterPill>
      )}
      {selectedTags.map((tag) => (
        <FilterPill
          key={tag}
          clearLabel={`Remove ${tag} filter`}
          onClear={() => setSelectedTags((prev) => prev.filter((x) => x !== tag))}
        >
          {tag}
        </FilterPill>
      ))}
    </div>
  );
}
