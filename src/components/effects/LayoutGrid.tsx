import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

export interface LayoutGridCard {
  id: number | string;
  src: string;
  className?: string;
  content: React.ReactNode;
}

interface LayoutGridProps {
  cards: LayoutGridCard[];
  className?: string;
}

/**
 * Aceternity-style LayoutGrid — bento-style image grid where clicking a
 * card expands it to fill the viewport using shared `layoutId` morph.
 * Strictly monochrome scrim/border.
 */
export function LayoutGrid({ cards, className }: LayoutGridProps) {
  const [selected, setSelected] = React.useState<LayoutGridCard | null>(null);

  return (
    <div className={cn('w-full h-full p-4 grid grid-cols-1 md:grid-cols-3 max-w-7xl mx-auto gap-4 relative', className)}>
      {cards.map((card) => (
        <motion.div
          key={card.id}
          onClick={() => setSelected(card)}
          layoutId={`grid-${card.id}`}
          className={cn(
            'relative overflow-hidden cursor-pointer rounded-xl ring-1 ring-border/60 bg-card',
            card.className,
          )}
        >
          <motion.img
            layoutId={`grid-img-${card.id}`}
            src={card.src}
            alt=""
            className="object-cover object-center absolute inset-0 h-full w-full transition-transform duration-500 hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </motion.div>
      ))}

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 bg-black/60 z-[1200]"
              aria-hidden="true"
            />
            <motion.div
              layoutId={`grid-${selected.id}`}
              className="fixed inset-x-4 top-10 bottom-10 md:inset-x-20 md:top-20 md:bottom-20 z-[1201] rounded-2xl overflow-hidden bg-card border border-border/60 shadow-[var(--shadow-aceternity-lg)] flex flex-col"
              onClick={() => setSelected(null)}
            >
              <motion.img
                layoutId={`grid-img-${selected.id}`}
                src={selected.src}
                alt=""
                className="object-cover w-full flex-1"
              />
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="bg-card p-6 max-h-[40%] overflow-y-auto"
              >
                {selected.content}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
