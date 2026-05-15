import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CardStackItem {
  id: string | number;
  name?: string;
  designation?: string;
  content: React.ReactNode;
}

interface CardStackProps {
  items: CardStackItem[];
  offset?: number;
  scaleFactor?: number;
  interval?: number;
  className?: string;
}

/**
 * Aceternity-style CardStack — auto-rotating deck of cards. The top card
 * shuffles to the back on interval. Used for testimonials, quotes, tips.
 */
export function CardStack({
  items,
  offset = 10,
  scaleFactor = 0.06,
  interval = 5000,
  className,
}: CardStackProps) {
  const [cards, setCards] = React.useState(items);

  React.useEffect(() => {
    const id = setInterval(() => {
      setCards((prev) => {
        const next = prev.slice();
        const top = next.shift();
        if (top) next.push(top);
        return next;
      });
    }, interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <div className={cn('relative h-60 w-full md:h-60 md:w-96', className)}>
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          className="absolute inset-0 rounded-container bg-card border border-border/60 shadow-[var(--shadow-aceternity)] p-6 flex flex-col justify-between"
          style={{ transformOrigin: 'top center' }}
          animate={{
            top: i * -offset,
            scale: 1 - i * scaleFactor,
            zIndex: cards.length - i,
          }}
        >
          <div className="text-sm text-foreground leading-relaxed">{card.content}</div>
          {(card.name || card.designation) && (
            <div className="mt-3">
              {card.name && <p className="text-sm font-semibold">{card.name}</p>}
              {card.designation && <p className="text-xs text-muted-foreground">{card.designation}</p>}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
