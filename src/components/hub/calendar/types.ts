import type { AgendaItem, AgendaKind } from '@/hooks/useMyAgenda';

/** Toggleable calendar layers (Google-Calendar-style sources). */
export type CalendarLayerId = 'trips' | 'events' | 'birthdays' | 'history' | 'news';

export type CalendarKind = AgendaKind | 'birthday' | 'history' | 'news';

export type CalendarView = 'month' | 'week' | 'day';

/**
 * One calendar occurrence. A superset of AgendaItem: the personal agenda
 * kinds pass through untouched; birthday/history/news items are synthesized
 * date-anchored all-day rows.
 */
export interface CalendarItem extends Omit<AgendaItem, 'kind'> {
  kind: CalendarKind;
  layer: CalendarLayerId;
}

/** Local YYYY-MM-DD key (mirrors useMyAgenda's localDayKey semantics). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Map an agenda kind to its calendar layer. */
export function layerOfAgendaKind(kind: AgendaKind): CalendarLayerId {
  return kind === 'trip' || kind === 'reservation' ? 'trips' : 'events';
}
