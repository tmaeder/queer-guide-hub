import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { groupProgramme, laneSpan, type ProgrammeChild } from '@/utils/prideProgramme';

/**
 * One line that says what a Pride edition actually consists of:
 * "Parade Sat 5 Jul · Festival 3–5 Jul · Week 28 Jun – 6 Jul".
 *
 * Shared by the /pride table, the /pride spotlight and the city card, so the
 * three cannot drift into three different date grammars.
 *
 * Renders nothing when the umbrella has no children — a bare date span is then
 * the honest answer and the caller keeps showing its own.
 */

function spanLabel(children: readonly ProgrammeChild[], withWeekday: boolean): string | null {
  const span = laneSpan(children);
  if (!span) return null;
  const [start, end] = span;
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
  if (sameDay) return format(start, withWeekday ? 'EEE d MMM' : 'd MMM');
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`;
}

export function ProgrammeSummary({
  entries,
  className,
}: {
  entries: readonly ProgrammeChild[];
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = useMemo(() => {
    const lanes = groupProgramme(entries);
    const out: string[] = [];
    // The parade keeps its weekday — "which day do I have to be there" is the
    // one question the parade line exists to answer.
    const parade = spanLabel(lanes.parade, true);
    if (parade) out.push(`${t('events.programme.parade', 'Parade')} ${parade}`);
    const festival = spanLabel(lanes.festival, false);
    if (festival) out.push(`${t('events.programme.festival', 'Festival')} ${festival}`);
    const week = spanLabel(lanes.week, false);
    if (week) out.push(`${t('events.programme.week', 'Pride Week')} ${week}`);
    return out;
  }, [entries, t]);

  if (parts.length === 0) return null;
  return <span className={className}>{parts.join(' · ')}</span>;
}
