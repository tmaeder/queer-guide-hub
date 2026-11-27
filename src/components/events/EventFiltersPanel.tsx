import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { MultiCombobox } from '@/components/events/MultiCombobox';
import { TagSelector } from '@/components/tags/TagSelector';
import { KinkFilterGroup } from '@/components/kink/KinkFilterGroup';
import { CalendarIcon, CalendarDays, MapPin, Ticket, Users, X } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useEventTypeOptions } from '@/lib/eventTypes';

// The "Pride type" chips that used to live here wrote `pride:parade`-style tags. No
// ingest path has ever produced them (0 rows carry a `pride:*` tag, and the
// `pride_subtypes` column they originally targeted is empty on all 39,715 events), so
// every chip was a guaranteed empty result set. The general tag filter below is backed
// by real data (34,988 events carry tags). Restore these only alongside a writer.

/**
 * Vocabulary rows behind the audience / accessibility pickers. `slug` is what the
 * entity columns store and therefore what the filter must send; `name` is display-only.
 */
type Option = { name: string; id: string; slug?: string | null };

export interface EventFiltersPanelProps {
  availableCities: string[];
  cities: string[];
  setCities: (v: string[]) => void;
  eventTypes: string[];
  setEventTypes: (v: string[]) => void;
  startDate: Date | undefined;
  setStartDate: (d: Date | undefined) => void;
  endDate: Date | undefined;
  setEndDate: (d: Date | undefined) => void;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  accAttrOptions: unknown;
  accessibilityAttrs: string[];
  setAccessibilityAttrs: (v: string[]) => void;
  tgOptions: unknown;
  targetGroupsFilter: string[];
  setTargetGroupsFilter: (v: string[]) => void;
  languages: string[];
  setLanguages: (v: string[]) => void;
  ageRestriction: string;
  setAgeRestriction: (v: string) => void;
  hasActiveFilters: boolean | string | number | null | undefined;
  /** Applied by the sheet's footer button. */
  onApply?: () => void;
  onClear: () => void;
  /**
   * Stack every picker in one column. The responsive grid below steps to 2
   * columns at md and 4 at lg, and those are VIEWPORT queries — inside the
   * ~448px filter sheet on a desktop they would try to lay four pickers across
   * the sheet's width.
   */
  singleColumn?: boolean;
}

/** Events extended-filters panel (cities, types, dates, a11y, audience, lang, age, tags). */
export function EventFiltersPanel({
  availableCities,
  cities,
  setCities,
  eventTypes,
  setEventTypes,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  selectedTags,
  setSelectedTags,
  accAttrOptions,
  accessibilityAttrs,
  setAccessibilityAttrs,
  tgOptions,
  targetGroupsFilter,
  setTargetGroupsFilter,
  languages,
  setLanguages,
  ageRestriction,
  setAgeRestriction,
  hasActiveFilters,
  onClear,
  singleColumn = false,
}: EventFiltersPanelProps) {
  const { t } = useTranslation();
  const eventTypeOptions = useEventTypeOptions();
  const gridClass = singleColumn
    ? 'grid grid-cols-1 gap-4'
    : 'grid grid-cols-1 gap-4 md:grid-cols-2';
  const dateButton = (value: Date | undefined, placeholder: string) => (
    <Button
      variant="outline"
      className={cn('w-full justify-start px-2.5 font-normal', !value && 'text-muted-foreground')}
    >
      <CalendarIcon size={16} className="me-2 shrink-0" />
      <span className="truncate">{value ? format(value, 'PP') : placeholder}</span>
    </Button>
  );
  return (
    <nav aria-label="Event filters" className="flex flex-col gap-4 pt-4">
      <FilterSection icon={CalendarDays} title={t('pages.events.filterWhen', 'When')}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('pages.events.dateFrom', 'From')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                {dateButton(startDate, t('pages.events.anyDate', 'Any date'))}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="p-4"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('pages.events.dateTo', 'To')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                {dateButton(endDate, t('pages.events.anyDate', 'Any date'))}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className="p-4"
                  disabled={(date) => (startDate ? date < startDate : false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </FilterSection>

      <FilterSection icon={MapPin} title={t('pages.events.filterWhere', 'Where')}>
        <MultiCombobox
          ariaLabel={t('pages.events.cities', 'Cities')}
          placeholder={t('pages.events.selectCities', 'Any city')}
          searchPlaceholder={t('pages.events.searchCities', 'Search cities…')}
          emptyText={t('pages.events.noCities', 'No cities found.')}
          options={availableCities.map((c) => ({ value: c, label: c }))}
          selected={cities}
          onChange={setCities}
        />
      </FilterSection>

      <FilterSection icon={Ticket} title={t('pages.events.filterWhat', 'What')}>
        <div className={gridClass}>
          <MultiCombobox
            ariaLabel={t('pages.events.eventType', 'Event type')}
            placeholder={t('pages.events.selectEventTypes', 'All types')}
            searchPlaceholder={t('pages.events.searchEventTypes', 'Search types…')}
            emptyText={t('pages.events.noTypes', 'No types found.')}
            options={eventTypeOptions}
            selected={eventTypes}
            onChange={setEventTypes}
          />
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            placeholder={t('pages.events.filterTags', 'Tags…')}
            maxTags={5}
            allowCustomTags={false}
            categories={['events']}
          />
        </div>
        <KinkFilterGroup
          target="events"
          selected={selectedTags}
          onToggle={(slug) =>
            setSelectedTags((prev) =>
              prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
            )
          }
        />
      </FilterSection>

      <FilterSection icon={Users} title={t('pages.events.filterWho', 'Who & access')}>
        <div className={gridClass}>
          <MultiCombobox
            ariaLabel={t('pages.events.targetGroups', 'Audience')}
            placeholder={t('pages.events.anyAudience', 'Any audience')}
            options={(tgOptions as Option[])
              .filter((g) => g.slug)
              .map((g) => ({ value: g.slug as string, label: g.name }))}
            selected={targetGroupsFilter}
            onChange={setTargetGroupsFilter}
          />
          <MultiCombobox
            ariaLabel={t('pages.events.accessibility', 'Accessibility')}
            placeholder={t('pages.events.anyAccessibility', 'Any accessibility needs')}
            options={(accAttrOptions as Option[])
              .filter((a) => a.slug)
              .map((a) => ({ value: a.slug as string, label: a.name }))}
            selected={accessibilityAttrs}
            onChange={setAccessibilityAttrs}
          />
          <MultiCombobox
            ariaLabel={t('pages.events.languages', 'Language')}
            placeholder={t('pages.events.anyLanguage', 'Any language')}
            options={LANGUAGE_OPTIONS}
            selected={languages}
            onChange={setLanguages}
          />
        </div>
        <div
          role="group"
          aria-label={t('pages.events.ageRestriction', 'Age restriction')}
          className="flex flex-wrap gap-2"
        >
          {/* `all-ages` (hyphen) is what normalize_age_restriction stores. */}
          {[
            ['', t('pages.events.anyAge', 'Any age')],
            ['all-ages', t('pages.events.ageAllAges', 'All ages')],
            ['18+', t('pages.events.age18Plus', '18+')],
            ['21+', t('pages.events.age21Plus', '21+')],
          ].map(([value, label]) => (
            <FilterChip
              key={value || 'any'}
              active={ageRestriction === value}
              onClick={() => setAgeRestriction(value)}
              label={label}
            />
          ))}
        </div>
      </FilterSection>

      {hasActiveFilters && (
        <Button variant="ghost" onClick={onClear} className="self-start gap-2">
          <X size={16} />
          {t('pages.events.clearAll', 'Clear all')}
        </Button>
      )}
    </nav>
  );
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
  { value: 'ru', label: 'Русский' },
];

function FilterSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-container bg-muted/60 p-4">
      <h3 className="flex items-center gap-2 text-13 font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card shadow-soft">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
