import { Link } from 'react-router';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EntityCard } from '@/lib/databaseBlock/normalize';

/**
 * The card used by the gallery, kanban and calendar layouts.
 *
 * An entity with no resolvable detail route renders unlinked rather than
 * pointing at a 404 — `href` is null in exactly that case, and inventing a
 * path would be worse than an inert card.
 */

interface EntityTileProps {
  card: EntityCard;
  /** 'cover' shows the image; 'compact' is a text-only row for dense columns. */
  variant?: 'cover' | 'compact';
  className?: string;
}

function metaLine(card: EntityCard): string | null {
  const parts = [card.city, card.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function EntityTile({ card, variant = 'cover', className }: EntityTileProps) {
  const meta = metaLine(card);

  const body = (
    <>
      {variant === 'cover' && (
        <Image
          imageUrl={card.imageUrl}
          alt={card.title}
          aspect="card"
          imageRole="cover"
          rounded="top"
          // Stable key so a missing image keeps the same fallback across reloads.
          fallbackKey={card.entityId}
        />
      )}
      <div className={cn('flex flex-col gap-2', variant === 'cover' ? 'p-4' : 'p-2')}>
        {card.categoryLabel && (
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            {card.categoryLabel}
          </span>
        )}
        <span className="text-15 font-medium leading-snug text-foreground">{card.title}</span>
        {meta && <span className="text-13 text-muted-foreground">{meta}</span>}
        {card.isFeatured && (
          <Badge variant="secondary" className="w-fit">
            Featured
          </Badge>
        )}
      </div>
    </>
  );

  const shell = cn(
    'block overflow-hidden border border-border bg-background rounded-container',
    'transition-colors hover:bg-accent',
    className,
  );

  if (!card.href) {
    return (
      <div className={shell} data-entity-id={card.entityId}>
        {body}
      </div>
    );
  }

  return (
    <Link to={card.href} className={cn(shell, 'no-underline')} data-entity-id={card.entityId}>
      {body}
    </Link>
  );
}
