import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyAgenda } from '@/hooks/useMyAgenda';
import { usePersonalityAnniversaries } from '@/hooks/usePersonalityAnniversaries';
import { useFriendsBirthdays } from '@/hooks/useFriendsBirthdays';
import { useSavedNewsByDate } from '@/hooks/useSavedNewsByDate';
import { localDayKey, layerOfAgendaKind } from './types';
import type { CalendarItem, CalendarLayerId } from './types';

/**
 * Composes the unified calendar's layers into one sorted item list + per-day
 * index. Each layer is an independent React Query hook — toggling a layer off
 * disables its fetch entirely. Personal agenda kinds map trips|reservation →
 * 'trips' layer, event kinds → 'events' (one shared useMyAgenda fetch).
 *
 * Multi-day items (trips) get one entry per covered day inside the window
 * (chip-per-day, no span bars). Known v1 gap: get_my_agenda's trips branch
 * only returns status planning|active, so completed trips are absent when
 * navigating past months.
 */
export function useCalendarItems(from: Date, to: Date, enabledLayers: Set<CalendarLayerId>) {
  const { t } = useTranslation();
  const agendaOn = enabledLayers.has('trips') || enabledLayers.has('events');
  // useMyAgenda has no `enabled` param; both layers off is rare — accept the
  // fetch and filter client-side.
  const { items: agendaItems, loading: agendaLoading } = useMyAgenda(from, to);
  const { items: history, loading: historyLoading } = usePersonalityAnniversaries(
    from,
    to,
    enabledLayers.has('history'),
  );
  const { items: birthdays, loading: birthdaysLoading } = useFriendsBirthdays(
    from,
    to,
    enabledLayers.has('birthdays'),
  );
  const { items: news, loading: newsLoading } = useSavedNewsByDate(
    from,
    to,
    enabledLayers.has('news'),
  );

  const { items, byDay } = useMemo(() => {
    const out: CalendarItem[] = [];

    if (agendaOn) {
      for (const item of agendaItems) {
        const layer = layerOfAgendaKind(item.kind);
        if (!enabledLayers.has(layer)) continue;
        out.push({ ...item, layer });
      }
    }

    if (enabledLayers.has('history')) {
      for (const h of history) {
        out.push({
          id: `hist_${h.anniversary}_${h.id}_${h.occurs_on}`,
          kind: 'history',
          layer: 'history',
          title: h.name,
          subtitle:
            h.anniversary === 'born'
              ? t('hub.calendar.bornYearsAgo', {
                  defaultValue: 'born {{count}} years ago',
                  count: h.years_ago,
                })
              : t('hub.calendar.diedYearsAgo', {
                  defaultValue: 'died {{count}} years ago',
                  count: h.years_ago,
                }),
          starts_at: `${h.occurs_on}T00:00:00`,
          ends_at: null,
          all_day: true,
          status: h.anniversary,
          open_target: `/personalities/${h.slug}`,
        });
      }
    }

    if (enabledLayers.has('birthdays')) {
      for (const b of birthdays) {
        out.push({
          id: `bday_${b.user_id}_${b.occurs_on}`,
          kind: 'birthday',
          layer: 'birthdays',
          title: b.display_name ?? 'Friend',
          subtitle: null,
          starts_at: `${b.occurs_on}T00:00:00`,
          ends_at: null,
          all_day: true,
          status: null,
          open_target: `/users/${b.user_id}`,
        });
      }
    }

    if (enabledLayers.has('news')) {
      for (const n of news) {
        out.push({
          id: `news_${n.article_id}`,
          kind: 'news',
          layer: 'news',
          title: n.title,
          subtitle: null,
          starts_at: n.published_at,
          ends_at: null,
          all_day: false,
          status: null,
          open_target: n.slug ? `/news/${n.slug}` : '/news',
        });
      }
    }

    out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    // Per-day index; multi-day items repeat on each covered day in-window.
    const byDay = new Map<string, CalendarItem[]>();
    const windowStart = new Date(from);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(to);
    for (const item of out) {
      const start = new Date(item.starts_at);
      const end = item.ends_at ? new Date(item.ends_at) : start;
      const cursor = new Date(Math.max(start.getTime(), windowStart.getTime()));
      cursor.setHours(0, 0, 0, 0);
      const last = new Date(Math.min(end.getTime(), windowEnd.getTime()));
      while (cursor <= last) {
        const key = localDayKey(cursor);
        const list = byDay.get(key);
        if (list) list.push(item);
        else byDay.set(key, [item]);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return { items: out, byDay };
  }, [agendaOn, agendaItems, history, birthdays, news, enabledLayers, from, to, t]);

  return {
    items,
    byDay,
    loading: agendaLoading || historyLoading || birthdaysLoading || newsLoading,
  };
}
