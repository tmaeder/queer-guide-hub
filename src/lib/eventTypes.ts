import { useTranslation } from 'react-i18next';

/**
 * Single source of truth for `events.event_type` values.
 * Must stay in sync with the DB CHECK constraint on `public.events.event_type`
 * (see supabase/migrations/00000000000000_baseline.sql).
 */
export const EVENT_TYPES = [
  'party',
  'festival',
  'pride',
  'meetup',
  'workshop',
  'concert',
  'conference',
  'film',
  'drag',
  'sports',
  'art',
  'theater',
  'fundraiser',
  'protest',
  'social',
  'community',
  'fair',
  'fetish',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const FALLBACK_LABELS: Record<EventType, string> = {
  party: 'Party',
  festival: 'Festival',
  pride: 'Pride',
  meetup: 'Meetup',
  workshop: 'Workshop',
  concert: 'Concert',
  conference: 'Conference',
  film: 'Film',
  drag: 'Drag',
  sports: 'Sports',
  art: 'Art',
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
export function useEventTypeOptions(): EventTypeOption[] {
  const { t } = useTranslation();
  return EVENT_TYPES.map((value) => ({
    value,
    label: t(`eventTypes.${value}`, { defaultValue: FALLBACK_LABELS[value] }),
  }));
}
