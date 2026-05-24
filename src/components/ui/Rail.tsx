import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RailProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Hide chevrons when content fits on screen */
  compact?: boolean;
}

export function Rail({ title, subtitle, action, children, className, compact }: RailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className={cn('space-y-4', className)} aria-label={title}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {!compact && (
            <div className="hidden md:flex gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll left"
                onClick={() => scrollBy(-1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll right"
                onClick={() => scrollBy(1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x scroll-smooth scrollbar-thin"
      >
        {children}
      </div>
    </section>
  );
}

interface RailItemProps {
  children: React.ReactNode;
  className?: string;
  width?: 'sm' | 'md' | 'lg';
}

export function RailItem({ children, className, width = 'md' }: RailItemProps) {
  return (
    <div
      className={cn(
        'shrink-0 snap-start',
        width === 'sm' && 'w-[220px] sm:w-[260px]',
        width === 'md' && 'w-[280px] sm:w-[320px] md:w-[360px]',
        width === 'lg' && 'w-[320px] sm:w-[380px] md:w-[440px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
