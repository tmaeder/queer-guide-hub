import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SingleSection } from './SinglePage';
import { RouteStrip } from './RouteStrip';
import type { Track } from './routeBulletMap';
import { singleStations, type SingleSectionDef } from './singleSectionModel';
import { cn } from '@/lib/utils';

function hashSectionId() {
  if (typeof window === 'undefined') return '';
  return decodeURIComponent(window.location.hash.replace(/^#/, ''));
}

function DisclosureSection({ section }: { section: SingleSectionDef }) {
  const { t } = useTranslation();
  const startsAtHash = hashSectionId() === section.id;
  const [open, setOpen] = useState(Boolean(section.defaultOpen || startsAtHash));
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const revealHashTarget = () => {
      if (hashSectionId() !== section.id) return;
      setOpen(true);
      requestAnimationFrame(() => {
        const heading = headingRef.current;
        if (!heading) return;
        heading.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      });
    };
    revealHashTarget();
    window.addEventListener('hashchange', revealHashTarget);
    const revealSelectedSection = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === section.id) revealHashTarget();
    };
    window.addEventListener('single-section-navigate', revealSelectedSection);
    return () => {
      window.removeEventListener('hashchange', revealHashTarget);
      window.removeEventListener('single-section-navigate', revealSelectedSection);
    };
  }, [section.id]);

  const panelId = `${section.id}-detail`;
  return (
    <section id={section.id} className="scroll-mt-32">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-headline leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {section.title}
          </h2>
          {section.note && (
            <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{section.note}</p>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex shrink-0 items-center gap-2 rounded-element px-4 py-2 text-13 font-bold transition-colors hover:bg-surface-container active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? t('common.showLess', 'Show less') : t('common.showMore', 'Show more')}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-4 w-4 transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
      {section.preview && <div className="mt-4">{section.preview}</div>}
      <div id={panelId} hidden={!open} className={section.variant === 'compact' ? 'mt-2' : 'mt-4'}>
        {open || !section.mountWhenOpen ? section.content : null}
      </div>
    </section>
  );
}

export function SingleSectionList({ sections }: { sections: SingleSectionDef[] }) {
  return (
    <>
      {sections.map((s) =>
        s.presentation === 'disclosure' ? (
          <DisclosureSection key={s.id} section={s} />
        ) : (
          <SingleSection key={s.id} id={s.id} title={s.title} note={s.note} variant={s.variant}>
            {s.content}
          </SingleSection>
        ),
      )}
    </>
  );
}

/**
 * The table of contents as a line, in the shape `SinglePage`'s two-column
 * frame needs.
 *
 * Traditional singles render this twice — horizontal at the top of the body
 * and vertical in the rail. Task-first location singles render only the
 * horizontal form because their map and safety context now live inline.
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
