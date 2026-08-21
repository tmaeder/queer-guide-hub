import { SingleSection } from './SinglePage';
import { RouteStrip } from './RouteStrip';
import type { Track } from './routeBulletMap';
import { singleStations, type SingleSectionDef } from './singleSectionModel';

export function SingleSectionList({ sections }: { sections: SingleSectionDef[] }) {
  return (
    <>
      {sections.map((s) => (
        <SingleSection key={s.id} id={s.id} title={s.title} note={s.note} variant={s.variant}>
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
 * Rendered TWICE by every single — horizontal at the top of the body, and
 * vertical in the rail — because the rail is a sibling that reflows UNDER the
 * body on mobile, so a rail-only TOC lands below the content it indexes. Two
 * renders per breakpoint is the house pattern (`/tags`' `CategoryTreeRail`
 * does the same); `hidden` on the mobile one would be the bug that pattern
 * exists to avoid — and is exactly the bug the event page shipped with, where
 * a `hidden md:block` rail dropped its whole contents on a phone.
 *
 * Below two sections there is nothing to navigate, so it renders nothing —
 * a one-stop line is not a line.
 */
export function SingleRouteRail({
  sections,
  activeId,
  onNavigate,
  orientation,
  track,
  label,
  className,
}: {
  sections: SingleSectionDef[];
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
      stations={singleStations(sections)}
      activeId={activeId}
      orientation={orientation}
      track={track}
      label={label}
      onNavigate={onNavigate}
      className={className}
    />
  );
}
