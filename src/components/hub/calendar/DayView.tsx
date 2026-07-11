import { useTranslation } from 'react-i18next';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { localDayKey } from './types';
import type { CalendarItem } from './types';

/**
 * Single-day view: personal commitments first (AgendaRow), then birthdays,
 * then the full "on this day in queer history" list (which the month grid
 * collapses to one aggregate chip).
 */
export function DayView({ date, byDay }: { date: Date; byDay: Map<string, CalendarItem[]> }) {
  const { t } = useTranslation();
  const items = byDay.get(localDayKey(date)) ?? [];
  const history = items.filter((i) => i.kind === 'history');
  const rest = items.filter((i) => i.kind !== 'history');

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('hub.calendar.dayEmpty', { defaultValue: 'Nothing on this day.' })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {rest.map((item) => (
            <AgendaRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-13 font-semibold uppercase tracking-wider text-muted-foreground">
            {t('hub.calendar.onThisDay', { defaultValue: 'On this day in queer history' })}
          </h3>
          {history.map((item) => (
            <AgendaRow key={item.id} item={item} />
          ))}
        </section>
      )}
    </div>
  );
}
