import * as React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CarouselCard {
  src: string;
  title: string;
  category?: string;
  href?: string;
}

interface AppleCardsCarouselProps {
  items: CarouselCard[];
  className?: string;
}

/**
 * Aceternity-style Apple-cards carousel — horizontal scroll with snap, soft
 * fade masks on each edge, and arrow controls. Monochrome chrome only.
 */
export function AppleCardsCarousel({ items, className }: AppleCardsCarouselProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [canL, setCanL] = React.useState(false);
  const [canR, setCanR] = React.useState(true);

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollBy = (px: number) => {
    ref.current?.scrollBy({ left: px, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 py-4 px-1 no-scrollbar [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]"
      >
        {items.map((card, i) => (
          <a
            key={i}
            href={card.href ?? '#'}
            className="snap-start shrink-0 w-64 h-80 md:w-80 md:h-96 relative rounded-2xl overflow-hidden group ring-1 ring-border/60 shadow-[var(--shadow-aceternity-sm)] hover:shadow-[var(--shadow-aceternity)] transition-shadow"
          >
            <motion.img
              src={card.src}
              alt={card.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 text-background">
              {card.category && (
                <p className="text-xs font-medium uppercase tracking-wider opacity-85">{card.category}</p>
              )}
              <h3 className="text-lg md:text-xl font-semibold mt-1 tracking-tight">{card.title}</h3>
            </div>
          </a>
        ))}
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-2 pr-2 pointer-events-none">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-320)}
          disabled={!canL}
          className="pointer-events-auto h-10 w-10 rounded-full bg-background/80 backdrop-blur border border-border/60 shadow-[var(--shadow-aceternity-sm)] flex items-center justify-center disabled:opacity-30 transition-opacity hover:bg-background"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(320)}
          disabled={!canR}
          className="pointer-events-auto h-10 w-10 rounded-full bg-background/80 backdrop-blur border border-border/60 shadow-[var(--shadow-aceternity-sm)] flex items-center justify-center disabled:opacity-30 transition-opacity hover:bg-background"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
