import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { MultiCombobox } from '@/components/events/MultiCombobox';
import { TagSelector } from '@/components/tags/TagSelector';
import { CalendarIcon, X } from 'lucide-react';
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

interface EventFiltersPanelProps {
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
  onApply: () => void;
  onClear: () => void;
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
  onApply,
  onClear,
}: EventFiltersPanelProps) {
  const { t } = useTranslation();
  const eventTypeOptions = useEventTypeOptions();
  return (
    <nav aria-label="Event filters" className="flex flex-col gap-4 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city">{t('pages.events.cities', 'Cities')}</Label>
          <MultiCombobox
            ariaLabel={t('pages.events.cities', 'Cities')}
            placeholder={t('pages.events.selectCities', 'Select cities…')}
            searchPlaceholder={t('pages.events.searchCities', 'Search cities…')}
            emptyText={t('pages.events.noCities', 'No cities found.')}
            options={availableCities.map((c) => ({ value: c, label: c }))}
            selected={cities}
            onChange={setCities}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="eventType">{t('pages.events.eventType', 'Event Type')}</Label>
          <MultiCombobox
            ariaLabel={t('pages.events.eventType', 'Event Type')}
            placeholder={t('pages.events.selectEventTypes', 'All types')}
            searchPlaceholder={t('pages.events.searchEventTypes', 'Search types…')}
            emptyText={t('pages.events.noTypes', 'No types found.')}
            options={eventTypeOptions}
            selected={eventTypes}
            onChange={setEventTypes}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('pages.events.startDate', 'Start Date')}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={!startDate ? 'text-muted-foreground' : ''}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  fontWeight: 400,
                }}
              >
                <CalendarIcon size={16} className="mr-2" />
                {startDate ? format(startDate, 'PPP') : <span>Pick start date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent style={{ width: 'auto' }} className="p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                initialFocus
                style={{ pointerEvents: 'auto' }}
                className="p-4"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('pages.events.endDate', 'End Date')}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={!endDate ? 'text-muted-foreground' : ''}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  fontWeight: 400,
                }}
              >
                <CalendarIcon size={16} className="mr-2" />
                {endDate ? format(endDate, 'PPP') : <span>Pick end date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent style={{ width: 'auto' }} className="p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                initialFocus
                style={{ pointerEvents: 'auto' }}
                className="p-4"
                disabled={(date) => (startDate ? date < startDate : false)}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Accessibility + Target groups + Language + Age */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="accessibility">{t('pages.events.accessibility', 'Accessibility')}</Label>
          <MultiCombobox
            ariaLabel={t('pages.events.accessibility', 'Accessibility')}
            placeholder={t('pages.events.accessibilityPlaceholder', 'Any')}
            options={(accAttrOptions as Option[])
              .filter((a) => a.slug)
              .map((a) => ({ value: a.slug as string, label: a.name }))}
            selected={accessibilityAttrs}
            onChange={setAccessibilityAttrs}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="target-groups">{t('pages.events.targetGroups', 'Audience')}</Label>
          <MultiCombobox
            ariaLabel={t('pages.events.targetGroups', 'Audience')}
            placeholder={t('pages.events.targetGroupsPlaceholder', 'Any')}
            options={(tgOptions as Option[])
              .filter((g) => g.slug)
              .map((g) => ({ value: g.slug as string, label: g.name }))}
            selected={targetGroupsFilter}
            onChange={setTargetGroupsFilter}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="languages">{t('pages.events.languages', 'Language')}</Label>
          <MultiCombobox
            ariaLabel={t('pages.events.languages', 'Language')}
            placeholder={t('pages.events.languagesPlaceholder', 'Any')}
            options={[
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
            ]}
            selected={languages}
            onChange={setLanguages}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="age-restriction">{t('pages.events.ageRestriction', 'Age restriction')}</Label>
          <Select
            value={ageRestriction || 'any'}
            onValueChange={(v) => setAgeRestriction(v === 'any' ? '' : v)}
          >
            <SelectTrigger aria-label={t('pages.events.ageRestriction', 'Age restriction')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('pages.events.ageAny', 'Any')}</SelectItem>
              {/* `all-ages` (hyphen) is what normalize_age_restriction stores. */}
              <SelectItem value="all-ages">{t('pages.events.ageAllAges', 'All ages')}</SelectItem>
              <SelectItem value="18+">{t('pages.events.age18Plus', '18+')}</SelectItem>
              <SelectItem value="21+">{t('pages.events.age21Plus', '21+')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tags */}
      <TagSelector
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        placeholder="Filter events by tags..."
        maxTags={5}
        allowCustomTags={false}
        categories={['events']}
      />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={onApply}>{t('pages.events.applyFilters', 'Apply Filters')}</Button>
        {hasActiveFilters && (
          <Button variant="outline" onClick={onClear} className="flex gap-2">
            <X size={16} />
            {t('pages.events.clearAll', 'Clear All')}
          </Button>
        )}
      </div>
    </nav>
  );
}
