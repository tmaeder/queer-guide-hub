import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { byDay, laneSpan, type ProgrammeChild } from '@/utils/prideProgramme';
import { byType, isParade, shouldOfferTypeToggle } from '@/utils/eventProgrammeView';
import { EVENT_TYPE_OPTIONS } from '@/lib/eventTypes';

/**
 * The programme of a multi-day event, as a timetable.
 *
 * WHY THIS IS NO LONGER THREE PRIDE LANES. The lanes (parade / festival / "Pride
 * Week") keyed on `pride_subtypes`, which is NULL on every child in the corpus, so
 * every child fell through to the `week` lane — and this component renders for ANY
 * umbrella, so a Madrid New Year's Eve party was published under a heading reading
 * "Pride Week". Measured 8 of 8. Renaming the lane would not have fixed it; the
 * vocabulary belongs to Pride and the page does not.
 *
 * Day is the primary axis: a festival's children are a timetable before they are a
 * taxonomy. A parade is pinned above it, because "which day must I be there" is the
 * one question a parade line exists to answer — that is the single genuinely
 * Pride-shaped thing worth keeping.
 *
 * COLOUR: one accent for the whole section. Groups are told apart by a `TransitIcon`
 * glyph plus a text label, NOT by colour — colour may never be the only cue
 * (WCAG 1.4.1). The pink station dot marks a heading and takes the ink ring every
 * track-coloured mark takes.
 *
 * LINKS: each row's link is an absolutely-positioned sibling of the row content,
 * never an anchor wrapping it — a row carries its own ticket link, and nesting one
 * interactive element in another is invalid HTML (axe `nested-interactive`).
 */

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE, d MMM');
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Midnight is what an all-day import looks like after normalisation, not a real
  // start time — printing "00:00" would invent a precision the row has not got.
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

/** Human label for an `event_type` slug, from the vocabulary the admin form uses. */
function typeLabel(slug: string): string {
  return EVENT_TYPE_OPTIONS.find((o) => o.value === slug)?.label ?? slug;
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

function Group({
  id,
  title,
  span,
  entries,
}: {
  id: string;
  title: string;
  span?: string;
  entries: ProgrammeChild[];
}) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={`programme-${id}`} className="mb-8 last:mb-0">
      <div className="mb-4 flex items-center gap-4">
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-track-ring bg-track-pink"
        />
        <h3 id={`programme-${id}`} className="text-title font-bold">
          {title}
        </h3>
        {span && <span className="text-13 text-muted-foreground">{span}</span>}
      </div>
      <ul className="list-none p-0">
        {entries.map((c) => (
          <ProgrammeRow key={c.id} child={c} />
        ))}
      </ul>
    </section>
  );
}

export function EventProgramme({ entries }: { entries: ProgrammeChild[] }) {
  const { t } = useTranslation();
  const [axis, setAxis] = useState<'day' | 'type'>('day');

  const parades = useMemo(() => entries.filter(isParade), [entries]);
  // A pinned parade is not repeated in the timetable below; it is the same event and
  // showing it twice reads as two.
  const rest = useMemo(() => entries.filter((c) => !isParade(c)), [entries]);

  const days = useMemo(() => byDay(rest), [rest]);
  const types = useMemo(() => byType(rest), [rest]);
  const offerToggle = useMemo(() => shouldOfferTypeToggle(rest), [rest]);
  const view = offerToggle ? axis : 'day';

  if (entries.length === 0) return null;

  return (
    <div>
      {parades.length > 0 && (
        <section aria-labelledby="programme-parade" className="mb-8">
          <div className="mb-4 flex items-center gap-4">
            <TransitIcon name="march" size={20} className="shrink-0 text-foreground" />
            <h3 id="programme-parade" className="text-title font-bold">
              {t('events.programme.parade', 'Parade')}
            </h3>
            <span className="text-13 text-muted-foreground">{fmtSpan(parades)}</span>
          </div>
          <ul className="list-none p-0">
            {parades.map((c) => (
              <ProgrammeRow key={c.id} child={c} />
            ))}
          </ul>
        </section>
      )}

      {offerToggle && (
        <div className="mb-6 flex items-center gap-2">
          <TransitIcon name="hours" size={16} className="shrink-0 text-muted-foreground" />
          {(['day', 'type'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAxis(option)}
              aria-pressed={axis === option}
              className={
                axis === option
                  ? 'rounded-badge border border-track-ring bg-track-pink px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-foreground'
                  : 'rounded-badge px-2 py-0.5 text-2xs uppercase tracking-wider text-muted-foreground'
              }
            >
              {option === 'day'
                ? t('events.programme.byDay', 'By day')
                : t('events.programme.byType', 'By type')}
            </button>
          ))}
        </div>
      )}

      {view === 'day'
        ? days.map(([day, group]) => (
            <Group key={day} id={day} title={fmtDay(group[0].start_date)} entries={group} />
          ))
        : types.map(([type, group]) => (
            <Group
              key={type}
              id={type}
              title={typeLabel(type)}
              span={fmtSpan(group)}
              entries={group}
            />
          ))}
    </div>
  );
}
