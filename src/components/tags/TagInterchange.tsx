/**
 * TagInterchange — the governed ontology drawn as a NETWORK of lines meeting
 * at one station, not as a single line.
 *
 * ONE LINE PER PARENT, AND THAT IS A CORRECTNESS FIX, NOT A RESTYLE.
 * This band used to render `get_tag_ontology`'s flat `broader` list as
 * consecutive stops above the tag, so `/tags/cis-man` published
 * "Cisgender -> Male -> Cis Man" — asserting Male is narrower than Cisgender.
 * It is not; both are parents. Measured on prod 2026-10-09, 184 of the 1,000
 * tags carrying a parent have two or more and were publishing that false
 * chain. Each parent is now its own line, so parallel parents cannot read as
 * a sequence, and the tag is the interchange those lines pass through.
 *
 * THE SECOND HOP IS WHAT MAKES IT A NETWORK. Of the 1,314 active tags with
 * any curated relation, 804 (61%) have exactly ONE 1-hop neighbour — drawn as
 * a graph that is two dots and a stick. Widening to siblings (a parent's other
 * children) and grandparents takes the same neighbourhoods to median 5 / p95
 * 28. `get_tag_ontology_network` does that widening in one round trip.
 *
 * The semantics are the diagram's, not decoration:
 *
 *   upstream → StationRing "done"       — where this line comes from
 *   parent   → StationRing "typed"      — the line itself, named
 *   this tag → filled `#` RouteBullet   — the interchange, on every line
 *   stops    → StationRing "open"       — the line's other stops (siblings)
 *   narrower → its own line downward    — the line continuing past the station
 *   related  → interchange chips        — change here for another line
 *
 * THE STATION REPEATS PER LINE ON PURPOSE. A transit map prints "14 St" on
 * the 1, the F and the L, because the station is on all three. Drawing it once
 * and converging the lines into it needs bracket geometry that does not
 * survive a column reflow; repeating it is both honest and responsive for free.
 *
 * FOUR TRACK COLOURS IN ONE COMPONENT. CLAUDE.md scopes "one accent per
 * context" and names CityNetwork as the sanctioned exception, for the reason
 * that applies here too: on a network diagram the colours ARE the vocabulary
 * that tells two converging lines apart, and one hue would make the artifact
 * unreadable rather than calmer. Max parents corpus-wide is 5 (p95 is 2), so
 * the four cycle and only the handful of 5-parent tags repeat a hue — those
 * two lines are still separated by position and by their printed names.
 *
 * Only the CURATED ontology appears here. The computed similarity pool
 * (`get_similar_tags`) used to render in this band; at its floor it published
 * noise as relatedness, so it is an internal candidate signal, never display.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { StationRing } from '@/components/transit/StationRing';
import { TRACK_BG, type Track } from '@/components/transit/routeBulletMap';
import {
  useTagOntologyNetwork,
  type OntologyTag,
  type OntologyLine,
} from '@/hooks/useTagRelationships';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { isAdultTag } from '@/components/resources/categoryMeta';

/** Cycled by line index. Pink first so a single-line tag — the common case,
 *  p95 is 2 parents — keeps the pink the tag bullet already uses. */
const LINE_TRACKS: readonly Track[] = ['pink', 'blue', 'green', 'yellow'];

/** One row of a line: its own segment of track, then its marker, then its
 *  name. The track is drawn PER ROW rather than as one bar behind the list,
 *  because a single absolutely-positioned rail has to guess where the first
 *  and last markers sit. Measured on the real page, rows are 52px tall while
 *  the shared rail's `top-3`/`bottom-3` inset assumed ~24px — so it overshot
 *  both ends by 14px and implied stops off the top and bottom of every line.
 *  `top-1/2` on the first row and `bottom-1/2` on the last terminate the line
 *  exactly at its end markers at any row height, with no magic number. */
function RailSegment({ track, edge }: { track: Track; edge: 'start' | 'end' | 'both' | 'none' }) {
  if (edge === 'both') return null; // a one-row line has no track to draw
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-0 flex w-4 justify-center',
        edge === 'start' && 'bottom-0 top-1/2',
        edge === 'end' && 'bottom-1/2 top-0',
        edge === 'none' && 'inset-y-0',
      )}
    >
      <span className={cn('h-full w-[3px]', TRACK_BG[track])} />
    </span>
  );
}

type Edge = 'start' | 'end' | 'both' | 'none';

/** `start` for the first row, `end` for the last, `both` when it is the only
 *  one. Derived from the row's index so a line's shape cannot drift from the
 *  rows it actually rendered. */
const edgeAt = (i: number, total: number): Edge =>
  total === 1 ? 'both' : i === 0 ? 'start' : i === total - 1 ? 'end' : 'none';

function Stop({
  tag,
  state,
  track,
  edge,
}: {
  tag: OntologyTag;
  state: 'done' | 'open';
  track: Track;
  edge: Edge;
}) {
  return (
    <li className="relative flex items-center gap-2 py-1">
      <RailSegment track={track} edge={edge} />
      <span className="relative flex w-4 shrink-0 justify-center">
        <StationRing state={state} />
      </span>
      <LocalizedLink
        to={`/tags/${encodeURIComponent(tag.slug)}`}
        className="min-w-0 flex-1 truncate px-2 py-0.5 text-13 leading-snug text-muted-foreground no-underline transition-colors hover:bg-surface-container hover:text-foreground"
      >
        {tag.name}
      </LocalizedLink>
    </li>
  );
}

/** The station every line in this band passes through. Repeated per line —
 *  see the header; a station is printed on each of its lines. */
function Interchange({ tagName, track, edge }: { tagName: string; track: Track; edge: Edge }) {
  return (
    <li className="relative flex items-center gap-2 py-1.5">
      <RailSegment track={track} edge={edge} />
      {/* Centred on the track, with NO negative margin. The single-line version
          carried `-ml-[7px]`, which shifts a 30px bullet off a 16px slot to
          span -14..16 — invisible when the line sat mid-page, clipped by the
          content edge the moment it became the first column. A station marker
          belongs ON its line; its overflow is symmetric by design, and the
          list's `pl-2` is what keeps that overflow inside the content box. */}
      <span className="relative flex w-4 shrink-0 justify-center">
        <RouteBullet type="tag" size={30} />
      </span>
      <span className="min-w-0 flex-1 truncate px-2 text-title font-bold">{tagName}</span>
    </li>
  );
}

/** The line's own station, named for the parent it represents. */
function LineHead({ line, track, edge }: { line: OntologyLine; track: Track; edge: Edge }) {
  return (
    <li className="relative flex items-center gap-2 py-1">
      <RailSegment track={track} edge={edge} />
      <span className="relative flex w-4 shrink-0 justify-center">
        <StationRing state="typed" track={track} />
      </span>
      <LocalizedLink
        to={`/tags/${encodeURIComponent(line.slug)}`}
        className="min-w-0 flex-1 truncate px-2 py-0.5 text-13 font-bold leading-snug no-underline transition-colors hover:bg-surface-container"
      >
        {line.name}
      </LocalizedLink>
    </li>
  );
}

function LineColumn({
  line,
  tagName,
  track,
}: {
  line: OntologyLine;
  tagName: string;
  track: Track;
}) {
  const { t } = useTranslation();
  // The cap lives in the RPC, so the overflow count is `stop_total` minus what
  // arrived — never `stops.length`, which is already capped — and Safe mode
  // may have removed more on top of that.
  const hidden = Math.max(0, line.stop_total - line.stops.length);
  // Flattened first so `edgeAt` sees the row's real position in the rendered
  // line. Deriving it per section instead ("upstream is always the start")
  // is wrong the moment a line has no grandparents, which is the common case.
  const rows = [
    ...line.upstream.map((up) => ({ kind: 'up' as const, tag: up })),
    { kind: 'head' as const, tag: line },
    { kind: 'here' as const, tag: line },
    ...line.stops.map((stop) => ({ kind: 'stop' as const, tag: stop })),
  ];

  return (
    <div>
      {/* No per-column label: the track colour and the bold parent name at the
          line's own station already identify it, and "Line" repeated three
          times across the band is noise, not wayfinding. */}
      <ol className="relative list-none p-0 pl-2">
        {rows.map((row, i) => {
          const edge = edgeAt(i, rows.length);
          if (row.kind === 'here')
            return <Interchange key="here" tagName={tagName} track={track} edge={edge} />;
          if (row.kind === 'head')
            return <LineHead key="head" line={line} track={track} edge={edge} />;
          return (
            <Stop
              key={row.tag.id}
              tag={row.tag}
              state={row.kind === 'up' ? 'done' : 'open'}
              track={track}
              edge={edge}
            />
          );
        })}
      </ol>
      {hidden > 0 && (
        <LocalizedLink
          to={`/tags/${encodeURIComponent(line.slug)}`}
          className="ml-6 mt-1 inline-block text-2xs font-semibold uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('tags.detail.moreOnLine', '+{{count}} more on this line', { count: hidden })}
        </LocalizedLink>
      )}
    </div>
  );
}

export function TagInterchange({ tagId, tagName }: { tagId: string; tagName: string }) {
  const { t } = useTranslation();
  const { data: ontology } = useTagOntologyNetwork(tagId);
  const { enabled: safeEnabled } = useSafeMode();

  const { lines, narrower, related } = useMemo(() => {
    const keep = (tag: OntologyTag) => !safeEnabled || !isAdultTag(tag);
    const clean = (list: OntologyTag[] | undefined) => (list ?? []).filter(keep);
    return {
      // A line is NAMED by its parent, so an adult parent takes the whole line
      // with it in Safe mode — filtering only its stops would leave a line
      // labelled with the term Safe mode exists to withhold.
      lines: (ontology?.lines ?? []).filter(keep).map((line) => ({
        ...line,
        upstream: clean(line.upstream),
        stops: clean(line.stops),
      })),
      narrower: clean(ontology?.narrower),
      related: clean(ontology?.related),
    };
  }, [ontology, safeEnabled]);

  if (!lines.length && !narrower.length && !related.length) return null;

  // No parent but children of its own: this tag heads its own line rather than
  // hanging in space. Measured, that is the shape of e.g. /tags/consent.
  const headsOwnLine = lines.length === 0 && narrower.length > 0;

  return (
    <section
      id="taxonomy"
      aria-labelledby="taxonomy-heading"
      className="border-y border-border-hairline py-8"
    >
      <Eyebrow as="p">{t('tags.detail.interchangeEyebrow', 'Interchange')}</Eyebrow>
      <h2
        id="taxonomy-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.interchangeTitle', 'In the taxonomy')}
      </h2>

      {lines.length > 0 && (
        <div
          className={cn(
            'mt-6 grid gap-x-8 gap-y-8',
            lines.length > 1 && 'sm:grid-cols-2',
            lines.length > 2 && 'lg:grid-cols-3',
          )}
        >
          {lines.map((line, i) => (
            <LineColumn
              key={line.id}
              line={line}
              tagName={tagName}
              track={LINE_TRACKS[i % LINE_TRACKS.length]}
            />
          ))}
        </div>
      )}

      {narrower.length > 0 && (
        <div className="mt-8">
          <Eyebrow as="p">
            {headsOwnLine
              ? t('tags.detail.stopsOnThisLine', 'Stops on this line')
              : t('tags.detail.continuesTo', 'Continues to')}
          </Eyebrow>
          <ol className="relative mt-2 list-none p-0 pl-2">
            {/* Pink: these are the tag's OWN children, so they belong to no
                parent line and take the tag's own track rather than borrowing
                a colour that already means "the Cisgender line". */}
            {headsOwnLine && (
              <Interchange tagName={tagName} track="pink" edge={edgeAt(0, narrower.length + 1)} />
            )}
            {narrower.map((tag, i) => (
              <Stop
                key={tag.id}
                tag={tag}
                state="open"
                track="pink"
                edge={edgeAt(headsOwnLine ? i + 1 : i, narrower.length + (headsOwnLine ? 1 : 0))}
              />
            ))}
          </ol>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-8">
          <Eyebrow as="p">{t('tags.detail.changeHereFor', 'Change here for')}</Eyebrow>
          <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
            {related.map((tag) => (
              <li key={tag.id}>
                <LocalizedLink
                  to={`/tags/${encodeURIComponent(tag.slug)}`}
                  className={cn(
                    'inline-flex items-center gap-2 bg-muted rounded-element px-2 py-1 text-13 font-bold no-underline transition-colors',
                    'hover:bg-foreground hover:text-background',
                  )}
                >
                  <RouteBullet type="tag" size={20} />
                  {tag.name}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
