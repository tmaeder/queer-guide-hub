import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExpandableCardItem {
  id: string;
  title: string;
  description?: string;
  src: string;
  ctaText?: string;
  ctaLink?: string;
  content: React.ReactNode;
}

interface ExpandableCardProps {
  items: ExpandableCardItem[];
  className?: string;
}

/**
 * Aceternity-style ExpandableCard grid — clicking a card morphs it into a
 * centered detail dialog via shared layoutId. ESC and outside-click close.
 */
export function ExpandableCard({ items, className }: ExpandableCardProps) {
  const [active, setActive] = React.useState<ExpandableCardItem | null>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActive(null);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [active]);

  return (
    <>
      <AnimatePresence>
        {active && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1200]"
              onClick={() => setActive(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-[1201] flex items-center justify-center p-4">
              <motion.button
                key={`btn-${active.id}`}
                layout={reduced ? undefined : true}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActive(null)}
                aria-label="Close"
                className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background border border-border/60 shadow-[var(--shadow-aceternity-sm)] hover:bg-muted transition-colors"
              >
                <X size={16} />
              </motion.button>
              <motion.div
                layoutId={reduced ? undefined : `card-${active.id}`}
                className="w-full max-w-lg bg-card rounded-container border border-border/60 shadow-[var(--shadow-aceternity-lg)] overflow-hidden flex flex-col max-h-[90vh]"
              >
                <motion.div layoutId={reduced ? undefined : `image-${active.id}`}>
                  <img src={active.src} alt={active.title} className="w-full h-72 object-cover" />
                </motion.div>
                <div className="p-6 overflow-y-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <motion.h3 layoutId={reduced ? undefined : `title-${active.id}`} className="text-xl font-bold tracking-tight">
                        {active.title}
                      </motion.h3>
                      {active.description && (
                        <motion.p layoutId={reduced ? undefined : `desc-${active.id}`} className="text-sm text-muted-foreground mt-1">
                          {active.description}
                        </motion.p>
                      )}
                    </div>
                    {active.ctaLink && (
                      <motion.a
                        layout={reduced ? undefined : true}
                        href={active.ctaLink}
                        className="inline-flex shrink-0 items-center rounded-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
                      >
                        {active.ctaText || 'Open'}
                      </motion.a>
                    )}
                  </div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm text-foreground/90 leading-relaxed">
                    {active.content}
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <ul className={cn('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4', className)}>
        {items.map((card) => (
          <motion.li
            key={card.id}
            layoutId={reduced ? undefined : `card-${card.id}`}
            onClick={() => setActive(card)}
            className="cursor-pointer bg-card rounded-container border border-border/60 overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow-aceternity)] transition-all"
          >
            <motion.div layoutId={reduced ? undefined : `image-${card.id}`}>
              <img src={card.src} alt={card.title} className="w-full h-40 object-cover" />
            </motion.div>
            <div className="p-4">
              <motion.h3 layoutId={reduced ? undefined : `title-${card.id}`} className="font-semibold tracking-tight">
                {card.title}
              </motion.h3>
              {card.description && (
                <motion.p layoutId={reduced ? undefined : `desc-${card.id}`} className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {card.description}
                </motion.p>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
