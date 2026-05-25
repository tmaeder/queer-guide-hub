import { useEffect, useRef, type ReactNode } from 'react';
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
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [activeId]);

  return (
    <nav
      aria-label="Sections"
      className={cn(
        'sticky top-16 z-30 -mx-4 mb-8 border-b bg-background/80 backdrop-blur',
        className,
      )}
    >
      <ul
        ref={listRef}
        className="mx-auto flex h-12 max-w-screen-2xl items-center gap-6 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  'relative inline-flex h-12 items-center whitespace-nowrap text-sm transition-colors no-underline',
                  isActive
                    ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-foreground'
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

