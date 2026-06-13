import { Star } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useUserReviews } from '@/hooks/useUserReviews';

interface UserReviewsListProps {
  userId: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          aria-hidden
          className={i < rating ? 'fill-foreground text-foreground' : 'text-border'}
        />
      ))}
    </span>
  );
}

/** Reviews this user wrote across venues + marketplace. */
export function UserReviewsList({ userId }: UserReviewsListProps) {
  const { data: reviews = [], isLoading } = useUserReviews(userId);

  if (isLoading) {
    return <div className="h-20 rounded-container border border-border bg-card animate-pulse" />;
  }
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="rounded-container border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4 mb-1">
            {r.target_link ? (
              <LocalizedLink to={r.target_link} className="text-sm font-semibold truncate">
                {r.target_name}
              </LocalizedLink>
            ) : (
              <span className="text-sm font-semibold truncate">{r.target_name}</span>
            )}
            <Stars rating={r.rating} />
          </div>
          {r.title && <p className="text-sm font-medium">{r.title}</p>}
          {r.content && <p className="text-sm text-muted-foreground line-clamp-3">{r.content}</p>}
          <p className="text-2xs uppercase tracking-wider text-muted-foreground mt-2">
            {r.kind === 'venue' ? 'Venue' : 'Marketplace'} ·{' '}
            {new Date(r.created_at).toLocaleDateString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
