import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface FocusCardProps {
  src: string;
  title: string;
  href?: string;
}

interface FocusCardsProps {
  cards: FocusCardProps[];
  className?: string;
}

/**
 * Aceternity-style FocusCards — a row of cards where hovering one
 * darkens / blurs the others, drawing the eye. Monochrome.
 */
export function FocusCards({ cards, className }: FocusCardsProps) {
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4', className)}>
      {cards.map((card, i) => (
        <a
          key={card.href ?? i}
          href={card.href ?? '#'}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            'group relative rounded-container overflow-hidden h-60 md:h-72 transition-all duration-300 ease-out',
            hovered !== null && hovered !== i && 'blur-[2px] scale-[0.98] opacity-70',
          )}
        >
          <motion.img
            src={card.src}
            alt={card.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-end p-4">
            <h3 className="text-background text-lg font-semibold tracking-tight">{card.title}</h3>
          </div>
        </a>
      ))}
    </div>
  );
}
