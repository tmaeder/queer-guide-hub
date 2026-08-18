import { useEffect, useRef, type ReactNode } from 'react';
import { STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
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
}

export function SectionNav({ items, activeId, onSelect, className }: SectionNavProps) {
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
         that IS the band's edge. The bleed follows PAGE_GUTTER so the rule
         reaches the viewport edge at every breakpoint and the item row still
         lines up with the page content above it — at a flat `-mx-4` the rule
         stopped 16px short of the gutter from `sm` up. */
      className={cn(
        'sticky z-30 -mx-4 mb-8 border-b border-border-hairline bg-background sm:-mx-6 md:-mx-8',
        STICKY_UNDER_HEADER,
        className,
      )}
    >
      <ul
        ref={listRef}
        className="mx-auto flex h-12 max-w-screen-2xl items-center gap-6 overflow-x-auto px-4 sm:px-6 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  'relative inline-flex h-12 items-center whitespace-nowrap text-13 font-bold transition-colors no-underline',
                  isActive
                    ? // Sits ON the nav's own rule and is thicker than it, so the
                      // active station reads as a stop on the line rather than a
                      // tint difference.
                      'text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-1 after:bg-foreground'
                    : 'text-muted-foreground hover:text-foreground',
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
