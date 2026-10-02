import { useEffect, useRef, type ReactNode } from 'react';
import { PAGE_BLEED, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  id: string;
  label: ReactNode;
}

export interface SectionNavProps {
  items: SectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  variant?: 'default' | 'subway';
}

export function SectionNav({
  items,
  activeId,
  onSelect,
  className,
  variant = 'default',
}: SectionNavProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

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

  return (
    <nav
      aria-label="Sections"
      /* A route strip, not a frosted iOS tab bar: solid paper with an ink rule
         that IS the band's edge. `PAGE_BLEED` cancels the gutter so the rule
         reaches the viewport edge at every breakpoint — at a flat `-mx-4` it
         stopped 16px short from `sm` up. Imported rather than restated: this
         carried its own `-mx-4 sm:-mx-6 md:-mx-8` copy, which is how it drifts
         from the ladder it is supposed to track. */
      className={cn(
        'sticky z-30 mb-8 border-b border-border-hairline bg-background',
        PAGE_BLEED,
        STICKY_UNDER_HEADER,
        className,
      )}
    >
      {/* `max-w-page`, NOT `max-w-screen-2xl`. The bleed above lands this row
          on the page container's own box, so a 1536px cap here is 64px NARROWER
          than the frame it sits in and `mx-auto` splits the difference into
          32px of margin per side — on top of the gutter this already re-applies.
          Measured on prod at 1990px: tabs began at 259 while the cards below
          began at 227. Invisible under 1536px, which is why it survived; the
          indent is max(0, (min(1600, vw) - 1536) / 2), so it only appears on
          large desktops and saturates at 32px from 1600 up. The cap must be the
          one the frame uses, or it is a second frame fighting the first. */}
      <ul
        ref={listRef}
        className={cn(
          'mx-auto flex max-w-page items-center overflow-x-auto px-4 sm:px-6 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          variant === 'subway' ? 'h-16 gap-4 md:gap-8' : 'h-12 gap-6',
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
                onClick={(e) => {
                  const target = document.getElementById(item.id);
                  if (target) {
                    e.preventDefault();
                    onSelect(item.id);
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={cn(
                  'relative inline-flex items-center whitespace-nowrap text-13 font-bold transition-colors no-underline',
                  variant === 'subway'
                    ? cn(
                        'h-10 gap-2 rounded-element px-4 before:block before:h-4 before:w-4 before:shrink-0 before:rounded-full before:border-[4px] before:border-foreground before:transition-colors',
                        isActive
                          ? 'bg-foreground text-background before:bg-track-blue'
                          : 'text-muted-foreground before:bg-background hover:bg-surface-container hover:text-foreground hover:before:bg-track-blue',
                      )
                    : cn(
                        'h-12',
                        isActive
                          ? // Sits ON the nav's own rule and is thicker than it, so the
                            // active station reads as a stop on the line rather than a
                            // tint difference.
                            'text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-1 after:bg-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      ),
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
