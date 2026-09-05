import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { useMilestonesForCity, useMilestonesForCountry } from '@/hooks/useMilestones';
import { buildLegalLine, type LegalStation } from '@/lib/rights/legalLine';
import { topicBySlug, topicListLabel } from '@/lib/rights/rightsCatalog';
import { cn } from '@/lib/utils';

/**
 * One country's legal chronology as a line of dated stations.
 *
 * Replaces two blocks that told the same story badly: `CountryLegalHistory`
 * (six truncated milestone titles) and the `CityMilestones` copy of it that
 * `CityRightsTab` admitted in a comment. Neither knew about the adoption years
 * the rights card was already rendering as grey sub-lines, so the same reform
 * appeared twice on one page in two different vocabularies, or not at all.
 * `src/lib/rights/legalLine.ts` does the fusing; this only draws it.
 *
 * INK ONLY. The rights surfaces are crisis-adjacent — `RightsScopeBar` and
 * `LensVerdictSummary` both say so in their headers — so no track colour
 * appears here. Impact is carried by `MilestoneImpactMarker`'s shape (filled
 * disc / open ring / destructive ✕), which survives greyscale and protanopia;
 * `--destructive` on a cut is the same functional-severity exception the
 * jurisdiction glyphs take.
 *
 * The rail is STRAIGHT, deliberately, for the reason `EraTrack` gives: row
 * heights are content-driven, so a bending SVG would need
 * `preserveAspectRatio="none"` and deform its stroke by a different amount on
 * every country. The bend belongs to the illustrative diagram on /history.
 */

/** Stations shown before the reader asks for the rest. */
const VISIBLE = 8;

function StationLabel({ station }: { station: LegalStation }) {
  const { t } = useTranslation();
  const { label } = station;

  if (label.kind === 'milestone') return <>{label.title}</>;
  if (label.kind === 'decriminalised') {
    return <>{t('rights.legalLine.decriminalised', 'Same-sex activity decriminalised')}</>;
  }

  // A reform year can carry seven statutes. Name three and count the rest —
  // the year is the event, the full list is what the rights card above is for.
  const names = label.slugs
    .map((slug) => {
      const topic = topicBySlug(slug);
      return topic ? topicListLabel(topic, t) : null;
    })
    .filter((n): n is string => n !== null);

  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length - 3;
  return (
    <>
      {rest > 0
        ? t('rights.legalLine.andMore', '{{list}} +{{count}} more', {
            list: shown,
            count: rest,
          })
        : shown}
    </>
  );
}

function Station({ station }: { station: LegalStation }) {
  const { t } = useTranslation();

  const body = (
    <>
      {/* Shares the 16px column the rail centres itself in, so the stroke runs
          exactly through the marker — the constant, not arithmetic, is what
          keeps them aligned. Same contract as MilestoneRow's `station`. */}
      <span className="mt-0.5 flex w-4 shrink-0 justify-center">
        <MilestoneImpactMarker impact={station.impact} size="station" />
      </span>
      <span className="w-14 shrink-0 text-13 font-bold tabular-nums">{station.year}</span>
      <span className="min-w-0 flex-1 text-13 leading-relaxed">
        <StationLabel station={station} />
        {station.scope === 'city' && (
          <span className="ms-2 text-xs2 text-muted-foreground">
            {t('rights.legalLine.inThisCity', 'in this city')}
          </span>
        )}
      </span>
    </>
  );

  // Only a milestone has a page. A derived station is an adoption year read
  // off the rights columns — there is nothing to open.
  return station.slug ? (
    <LocalizedLink
      to={`/history/${station.slug}`}
      // `no-underline` is load-bearing inside an <li>: the unlayered
      // `li a:not(.no-underline)` rule in index.css forces `display: inline`
      // and collapses this flex row. jsdom never applies that stylesheet, so
      // only Playwright can catch the regression. See MilestoneRow.
      className="group flex items-start gap-4 no-underline"
    >
      {body}
    </LocalizedLink>
  ) : (
    <span className="flex items-start gap-4">{body}</span>
  );
}

/** The rail itself. Presentational — takes stations, fetches nothing. */
export function LegalLine({
  stations,
  seeAllHref,
  className,
}: {
  stations: LegalStation[];
  seeAllHref?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (stations.length === 0) return null;

  // Newest first. `buildLegalLine` returns the canonical ascending chronology,
  // but this surface keeps the ordering `CountryLegalRecord` established and
  // its test states the reason for: the most recent change is the one a
  // traveller is deciding on, and a legal record read most-recent-last buries
  // it under the 19th century. Truncation therefore drops the OLDEST rows.
  const ordered = [...stations].reverse();
  const hidden = expanded ? 0 : Math.max(0, ordered.length - VISIBLE);
  const shown = hidden > 0 ? ordered.slice(0, VISIBLE) : ordered;

  return (
    <div className={cn('rounded-element bg-muted p-4 sm:p-6', className)}>
      <ol className="relative m-0 list-none p-0">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 flex w-4 justify-center"
        >
          <span className="w-[3px] bg-foreground" />
        </span>
        {shown.map((station) => (
          // `relative` is load-bearing: the rail is absolutely positioned and
          // would otherwise paint over the station markers.
          <li key={station.id} className="relative py-2 first:pt-0 last:pb-0">
            <Station station={station} />
          </li>
        ))}
      </ol>

      {(hidden > 0 || seeAllHref) && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-13 font-bold underline underline-offset-4 hover:no-underline"
            >
              {t('rights.legalLine.showEarlier', 'Show {{count}} earlier', { count: hidden })}
            </button>
          )}
          {seeAllHref && (
            <LocalizedLink
              to={seeAllHref}
              className="text-13 font-bold no-underline underline-offset-4 hover:underline"
            >
              {t('rights.legalLine.seeAll', 'Full timeline')}
            </LocalizedLink>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Connected wrapper: fuses this country's milestones and adoption years, plus
 * the city's own milestones when a city is being viewed. Self-hides on zero.
 */
export function CountryLegalLine({
  country,
  countryId,
  countryName,
  cityId,
  className,
}: {
  country: Record<string, unknown> | null | undefined;
  countryId: string | null | undefined;
  countryName?: string | null;
  /** Present on /city/:slug — adds milestones that happened in that city. */
  cityId?: string;
  className?: string;
}) {
  const { data: countryMilestones } = useMilestonesForCountry(countryId ?? undefined, 12);
  const { data: cityMilestones } = useMilestonesForCity(cityId);

  const stations = buildLegalLine({
    country,
    milestones: countryMilestones,
    cityMilestones: cityId ? cityMilestones : null,
  });

  return (
    <LegalLine
      stations={stations}
      seeAllHref={countryName ? `/history?country=${encodeURIComponent(countryName)}` : '/history'}
      className={className}
    />
  );
}
