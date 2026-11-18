import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cleanTitle } from '@/utils/htmlDecode';
import type { Tables } from '@/integrations/supabase/types';
import { startOfWeek } from 'date-fns';

type Article = Tables<'news_articles'>;

interface WeekInReviewProps {
  articles: Article[];
}

export function WeekInReview({ articles }: WeekInReviewProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisWeek = articles.filter((a) => {
    if (!a.published_at) return false;
    return new Date(a.published_at) >= weekStart;
  });

  const topRead = [...thisWeek]
    .filter((a) => (a.views_count ?? 0) > 0)
    .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0))
    .slice(0, 5);

  // Nothing to rank yet: no section rather than a heading over an empty list.
  if (topRead.length === 0) return null;

  return (
    <section aria-labelledby="week-review-heading" className="mb-16">
      <h2
        id="week-review-heading"
        className="m-0 text-display font-bold leading-none tracking-tight"
      >
        Most read.
      </h2>

      <ol className="mt-8 m-0 p-0 list-none flex flex-col">
        {topRead.map((a, i) => (
          <li key={a.id} className="py-4 flex gap-6 items-baseline">
            <span className="text-display font-bold leading-none tracking-tight text-muted-foreground tabular-nums">
              {(i + 1).toString().padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <LocalizedLink
                to={`/news/${a.slug}`}
                className="block no-underline text-foreground hover:underline text-title font-semibold leading-tight"
              >
                {cleanTitle(a.title ?? '')}
              </LocalizedLink>
              <p className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
                {(a.views_count ?? 0).toLocaleString()} reads
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
