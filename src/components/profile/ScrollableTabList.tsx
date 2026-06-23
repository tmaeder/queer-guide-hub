import * as React from 'react';
import { TabsList } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ScrollableTabListProps
  extends React.ComponentPropsWithoutRef<typeof TabsList> {
  children: React.ReactNode;
}

/**
 * Horizontally-scrollable tab strip for narrow viewports. Keeps a single Radix
 * TabsList (every trigger stays mounted → roving focus + active indicator
 * intact) and lets the row scroll instead of clipping when there are more tabs
 * than fit. The bottom divider sits on the wrapper so it stays full-width while
 * the triggers scroll. Edge fades use `mask-image` (an alpha clip — paints no
 * color, so it honors the monochrome / no-gradient design rule). Degrades to a
 * plain row when everything fits (no scroll, no fade).
 */
export function ScrollableTabList({ className, children, ...props }: ScrollableTabListProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    // Center the active trigger so a deep link (e.g. /me/progress) doesn't land
    // with its tab off-screen.
    el.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update, children]);

  const mask =
    edges.start && edges.end
      ? 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
      : edges.start
        ? 'linear-gradient(to right, transparent, black 24px)'
        : edges.end
          ? 'linear-gradient(to right, black calc(100% - 24px), transparent)'
          : undefined;

  return (
    <div className="relative border-b border-border">
      <TabsList
        ref={ref}
        className={cn(
          'h-auto w-max min-w-full justify-start gap-0 rounded-none border-0 bg-transparent p-0 backdrop-blur-none',
          'overflow-x-auto scroll-smooth snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
        style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
        {...props}
      >
        {children}
      </TabsList>
    </div>
  );
}
