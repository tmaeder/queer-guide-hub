import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import {
  groupProgramme,
  hasProgramme,
  laneSpan,
  byDay,
  type ProgrammeChild,
  type ProgrammeLane,
} from '@/utils/prideProgramme';

/**
 * The programme of a Pride edition, rendered as three lanes: parade, festival,
 * Pride Week.
 *
 * COLOUR: one accent for the whole section. The three lanes are told apart by a
 * `TransitIcon` glyph plus a text label, NOT by three track colours — "one
 * accent per context" is the house rule, and colour may never be the only cue
 * (WCAG 1.4.1). The pink station dot marks the lane heading and takes the ink
 * ring every track-coloured mark takes.
 *
 * LINKS: each row's link is an absolutely-positioned sibling of the row content,
 * never an anchor wrapping it — a row carries its own ticket link, and nesting
 * one interactive element in another is invalid HTML (axe `nested-interactive`).
 */

const LANE_ICON: Record<ProgrammeLane, TransitIconName> = {
  parade: 'march',
  festival: 'events',
  week: 'hours',
};

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE, d MMM');
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Midnight is what an all-day import looks like after normalisation, not a
  // real start time — printing "00:00" would invent a precision the row has not
  // got.
  if (d.getHours() === 0 && d.getMinutes() === 0) return '';
  return format(d, 'HH:mm');
}

function fmtSpan(children: readonly ProgrammeChild[]): string {
  const span = laneSpan(children);
  if (!span) return '';
  const [start, end] = span;
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
  return sameDay ? format(start, 'd MMM') : `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`;
}

function ProgrammeRow({ child }: { child: ProgrammeChild }) {
  const { t } = useTranslation();
  const time = fmtTime(child.start_date);
  const place = child.venue_name || child.address || '';

  return (
    <li className="relative">
      <div className="flex items-baseline gap-4 border-b border-border-hairline py-2">
        <span className="w-14 shrink-0 text-13 tabular-nums text-muted-foreground">
          {time || fmtDay(child.start_date).split(',')[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{child.title}</span>
          {place && <span className="block text-13 text-muted-foreground">{place}</span>}
        </span>
        {child.is_free ? (
          <Badge variant="soft" className="shrink-0">
            {t('events.programme.free', 'Free')}
          </Badge>
        ) : null}
      </div>
      <LocalizedLink
        to={`/events/${child.slug}`}
        aria-label={child.title}
        className="absolute inset-0 rounded-element no-underline"
      />
    </li>
  );
}

function Lane({
  lane,
  entries,
  title,
}: {
  lane: ProgrammeLane;
  entries: ProgrammeChild[];
  title: string;
}) {
  const span = fmtSpan(entries);
  // Only the week lane earns day headings: parade is one entry by definition and
  // a festival's own rows already read as consecutive days.
  const days = lane === 'week' ? byDay(entries) : null;

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby={`programme-${lane}`} className="mb-8 last:mb-0">
      <div className="mb-4 flex items-center gap-4">
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-track-ring bg-track-pink"
        />
        <TransitIcon name={LANE_ICON[lane]} size={20} className="shrink-0 text-foreground" />
        <h3 id={`programme-${lane}`} className="text-title font-bold">
          {title}
        </h3>
        {span && <span className="text-13 text-muted-foreground">{span}</span>}
      </div>

      {days ? (
        days.map(([day, entries]) => (
          <div key={day} className="mb-4 last:mb-0">
            <p className="mb-1 text-2xs uppercase tracking-wider text-muted-foreground">
              {fmtDay(entries[0].start_date)}
            </p>
            <ul className="list-none p-0">
              {entries.map((c) => (
                <ProgrammeRow key={c.id} child={c} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="list-none p-0">
          {entries.map((c) => (
            <ProgrammeRow key={c.id} child={c} />
          ))}
        </ul>
      )}

    </section>
  );
}

export function EventProgramme({ entries }: { entries: ProgrammeChild[] }) {
  const { t } = useTranslation();
  const lanes = useMemo(() => groupProgramme(entries), [entries]);

  if (!hasProgramme(lanes)) return null;

  return (
    <div>
      <Lane lane="parade" entries={lanes.parade} title={t('events.programme.parade', 'Parade')} />
      <Lane
        lane="festival"
        entries={lanes.festival}
        title={t('events.programme.festival', 'Festival')}
      />
      <Lane lane="week" entries={lanes.week} title={t('events.programme.week', 'Pride Week')} />
    </div>
  );
}
