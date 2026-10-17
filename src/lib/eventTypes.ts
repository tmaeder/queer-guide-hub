import { useVocabularyOptions, useManagedLabel } from '@/hooks/useManagedOptions';
import { useTranslation } from 'react-i18next';

/** Seed values and offline labels; runtime choices come from event_types. */
export const EVENT_TYPES = [
  'party',
  'festival',
  'cruise',
  'pride',
  'meetup',
  'workshop',
  'concert',
  'comedy',
  'conference',
  'film',
  'drag',
  'sports',
  'art',
  'exhibition',
  'theater',
  'fundraiser',
  'protest',
  'social',
  'community',
  'fair',
  'fetish',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number] | (string & {});

const FALLBACK_LABELS: Record<EventType, string> = {
  party: 'Party',
  festival: 'Festival',
  cruise: 'Cruise',
  pride: 'Pride',
  meetup: 'Meetup',
  workshop: 'Workshop',
  concert: 'Concert',
  comedy: 'Comedy',
  conference: 'Conference',
  film: 'Film',
  drag: 'Drag',
  sports: 'Sports',
  art: 'Art',
  exhibition: 'Exhibition',
  theater: 'Theater',
  fundraiser: 'Fundraiser',
  protest: 'Protest',
  social: 'Social',
  community: 'Community',
  fair: 'Fair',
  fetish: 'Fetish',
  other: 'Other',
};

export interface EventTypeOption {
  value: EventType;
  label: string;
}

/** English-label options — safe to use outside React/i18n context. */
export const EVENT_TYPE_OPTIONS: EventTypeOption[] = EVENT_TYPES.map((value) => ({
  value,
  label: FALLBACK_LABELS[value],
}));

/** Translated options keyed by `eventTypes.<value>` in the current locale. */
export function useEventTypeOptions(selected?: unknown): EventTypeOption[] {
  const { t } = useTranslation();
  const fallback = EVENT_TYPES.map((value) => ({
    value,
    label: t(`eventTypes.${value}`, { defaultValue: FALLBACK_LABELS[value] }),
  }));
  return useVocabularyOptions(
    {
      table: 'event_types',
      valueColumn: 'slug',
      labelColumn: 'name',
      orderBy: 'sort_order',
      activeColumn: 'is_active',
    },
    fallback,
    selected,
  );
}

export function useEventTypeLabel(value: string | null | undefined): string {
  const { t } = useTranslation();
  const seed = FALLBACK_LABELS[value ?? ''];
  return useManagedLabel(
    {
      table: 'event_types',
      valueColumn: 'slug',
      labelColumn: 'name',
      orderBy: 'sort_order',
      activeColumn: 'is_active',
    },
    value,
    value ? t(`eventTypes.${value}`, { defaultValue: seed ?? value }) : '',
    seed,
  );
}
