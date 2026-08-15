import { SingleSection } from '@/components/transit/SinglePage';
import { RouteStrip } from '@/components/transit/RouteStrip';
import type { Track } from '@/components/transit/routeBulletMap';
import { geoStations, type GeoSection } from './geoSectionModel';

export function GeoSectionList({ sections }: { sections: GeoSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <SingleSection key={s.id} id={s.id} title={s.title} note={s.note}>
          {s.content}
        </SingleSection>
      ))}
    </>
  );
}

/**
 * The table of contents as a line, in the shape `SinglePage`'s two-column
 * frame needs.
 *
 * Rendered TWICE by every geo page — horizontal at the top of the body, and
 * vertical in the 360px rail — because the rail is a sibling that reflows
 * UNDER the body on mobile, so a rail-only TOC lands below the content it
 * indexes. Two renders per breakpoint is the house pattern (`/tags`'
 * `CategoryTreeRail` does the same); `hidden` on the mobile one would be the
 * bug that pattern exists to avoid.
 *
 * Below two sections there is nothing to navigate, so it renders nothing —
 * a one-stop line is not a line.
 */
export function GeoRouteRail({
  sections,
  activeId,
  onNavigate,
  orientation,
  track,
  label,
  className,
}: {
  sections: GeoSection[];
  activeId: string;
  onNavigate: (id: string) => void;
  orientation: 'vertical' | 'horizontal';
  track?: Track;
  label: string;
  className?: string;
}) {
  if (sections.length < 2) return null;
  return (
    <RouteStrip
      stations={geoStations(sections)}
      activeId={activeId}
      orientation={orientation}
      track={track}
      label={label}
      onNavigate={onNavigate}
      className={className}
    />
  );
}
