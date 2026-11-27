import { createElement, useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import {
  PAGE_BLEED,
  PAGE_BLEED_GUTTER,
  STICKY_UNDER_HEADER,
} from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { CONTENTS_MENU_MIN_STATIONS, ContentsMenu } from '@/components/transit/RouteStrip';

export interface SectionNavItem {
  id: string;
  label: ReactNode;
  /** Shown before the label; replaces the subway station dot. */
  icon?: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

export interface SectionNavProps {
  items: SectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  variant?: 'default' | 'subway';
  /** Scope controls that stick with the nav (city, date, filters). */
  toolbar?: ReactNode;
}

export function SectionNav({
  items,
  activeId,
  onSelect,
  className,
  variant = 'default',
  toolbar,
}: SectionNavProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    onSelect(id);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(`[data-section-id="${activeId}"]`);
    if (!active) return;
    // Scroll the LIST horizontally — never via scrollIntoView, which also
    // scrolls the PAGE. Even `block: 'nearest'` scrolls vertically when the
    // element is not fully visible, and this nav is sticky directly beneath a
    // sticky header, so on mount it read as obscured and jumped the document
    // ~260px. That dragged whatever sat above into the header band: it put a
    // city page's "Official website" link under the header and failed axe
    // `target-size` ("partially obscured"). Centring by scrollLeft touches
    // only this element's own scroll offset and cannot move the document.
    const left = Math.max(0, active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2);
    // jsdom implements neither scrollTo nor smooth behaviour on elements, and
    // an unguarded call throws inside the effect — which took every
    // EditorialDetailLayout test down with it. Assigning scrollLeft is the
    // equivalent instant scroll and works everywhere.
    if (typeof list.scrollTo === 'function') list.scrollTo({ left, behavior: 'smooth' });
    else list.scrollLeft = left;
  }, [activeId]);

  const stickyClass = cn(
    'sticky z-30 mb-8 rounded-container sticky-glass pt-4 pb-2',
    PAGE_BLEED,
    PAGE_BLEED_GUTTER,
    STICKY_UNDER_HEADER,
    className,
  );
  /* A rounded route selector. The rail is tonal rather than ruled, and it
     stays inside the page gutter so its soft silhouette remains visible. */
  /* `max-w-page`, NOT `max-w-screen-2xl`. The bleed above lands this row
      on the page container's own box, so a 1536px cap here is 64px NARROWER
      than the frame it sits in and `mx-auto` splits the difference into
      32px of margin per side — on top of the gutter this already re-applies.
      Measured on prod at 1990px: tabs began at 259 while the cards below
      began at 227. Invisible under 1536px, which is why it survived; the
      indent is max(0, (min(1600, vw) - 1536) / 2), so it only appears on
      large desktops and saturates at 32px from 1600 up. The cap must be the
      one the frame uses, or it is a second frame fighting the first. */
  const list = (
    <ul
      ref={listRef}
      className={cn(
        'mx-auto flex max-w-page items-center overflow-x-auto rounded-container bg-surface-container [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'subway'
          ? 'min-h-16 gap-2 p-2 md:justify-between md:gap-4'
          : 'min-h-12 gap-1 p-1',
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <li key={item.id} className="snap-center shrink-0">
            <a
              href={`#${item.id}`}
              data-section-id={item.id}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => jump(e, item.id)}
              className={cn(
                'relative inline-flex items-center whitespace-nowrap text-15 font-bold transition-colors no-underline',
                variant === 'subway' && item.icon
                  ? cn(
                      'h-11 gap-2 rounded-element px-4',
                      isActive
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-surface-container hover:text-foreground',
                    )
                  : variant === 'subway'
                    ? cn(
                        'h-11 gap-2.5 rounded-element px-4 before:block before:h-6 before:w-6 before:shrink-0 before:rounded-full before:border-[4px] before:transition-colors',
                        isActive
                          ? 'bg-foreground text-background before:border-background before:bg-track-blue'
                          : 'text-muted-foreground before:border-foreground before:bg-background hover:bg-surface-container hover:text-foreground hover:before:bg-track-blue',
                      )
                    : cn(
                        'h-11 rounded-element px-4',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                      ),
              )}
            >
              {item.icon ? (
                <span className="inline-flex items-center gap-2">
                  {createElement(item.icon, { size: 16, 'aria-hidden': true })}
                  {item.label}
                </span>
              ) : (
                item.label
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );

  // The strip scrolls sideways on a phone with its scrollbar hidden, so past a
  // few sections the later ones were reachable only by guessing. One button
  // lists them all (shared with RouteStrip so the two navs cannot diverge).
  const nav = (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">{list}</div>
      {items.length >= CONTENTS_MENU_MIN_STATIONS && (
        <ContentsMenu
          stations={items.map((item) => ({ id: item.id, title: item.label }))}
          activeId={activeId}
          onSelect={jump}
        />
      )}
    </div>
  );

  // A toolbar sits inside the same sticky block, outside the <nav> landmark:
  // it changes what the sections show, it does not navigate between them.
  if (!toolbar) {
    return (
      <nav aria-label="Sections" className={stickyClass}>
        {nav}
      </nav>
    );
  }
  return (
    <div className={stickyClass}>
      {/* Every section can be empty under a narrow filter; the toolbar is then
          the way back, so it stays and the empty rail goes. */}
      {items.length > 0 ? <nav aria-label="Sections">{nav}</nav> : null}
      <div className={cn('mx-auto max-w-page', items.length > 0 && 'mt-2')}>{toolbar}</div>
    </div>
  );
}
