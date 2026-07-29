import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import type { EntityLayoutProps } from './layoutTypes';
import type { EntityCard } from '@/lib/databaseBlock/normalize';

/**
 * Dense, data-rich rows. A real <table> would fight the surrounding prose
 * width, so this is a definition-style list that stays readable at any column
 * width and keeps each row a single tap target on mobile.
 */

function formatDates(card: EntityCard): string | null {
  if (card.startMs === null) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const start = fmt(card.startMs);
  if (card.endMs === null || card.endMs === card.startMs) return start;
  return `${start} – ${fmt(card.endMs)}`;
}

function Row({ card }: { card: EntityCard }) {
  const dates = formatDates(card);
  const place = [card.city, card.country].filter(Boolean).join(', ');

  const inner = (
    <>
      <Image
        imageUrl={card.imageUrl}
        alt={card.title}
        aspect="thumb"
        imageRole="thumb"
        rounded="element"
        fallbackKey={card.entityId}
        className="w-12 shrink-0"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-15 font-medium text-foreground">{card.title}</span>
        {(place || dates) && (
          <span className="truncate text-13 text-muted-foreground">
            {[dates, place].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {card.categoryLabel && (
        <Badge variant="secondary" className="ml-auto hidden shrink-0 sm:inline-flex">
          {card.categoryLabel}
        </Badge>
      )}
    </>
  );

  const shell =
    'flex min-h-11 items-center gap-4 border-b border-border px-2 py-2 last:border-b-0';

  if (!card.href) {
    return <li className={shell}>{inner}</li>;
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={card.href}
        className="flex min-h-11 items-center gap-4 px-2 py-2 no-underline transition-colors hover:bg-accent"
      >
        {inner}
      </Link>
    </li>
  );
}

export function EntityListLayout({ cards, isLoading }: EntityLayoutProps) {
  if (isLoading && cards.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-element" />
        ))}
      </div>
    );
  }

  return (
    <ul className="list-none border border-border rounded-container p-0">
      {cards.map((card) => (
        <Row key={card.docId} card={card} />
      ))}
    </ul>
  );
}
