import { ArrowRight } from '@/components/icons';
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
      <h2 id="week-review-heading" className="m-0 font-display text-display leading-none">
        Most read
      </h2>

      {/* One card, ranked rows: a pink rank disc leads, the reads ride as a chip. */}
      <ol className="m-0 mt-8 flex list-none flex-col divide-y divide-border-hairline overflow-hidden rounded-container bg-card p-0 shadow-soft">
        {topRead.map((a, i) => (
          <li key={a.id}>
            <LocalizedLink
              to={`/news/${a.slug}`}
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 no-underline hover:bg-surface-container md:px-6"
            >
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-track-ring bg-track-pink text-title font-bold text-track-ring"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-title font-bold leading-tight text-foreground group-hover:underline">
                  {cleanTitle(a.title ?? '')}
                </span>
                <span className="mt-2 inline-flex rounded-element bg-muted px-2 py-1 text-2xs uppercase tracking-wider text-muted-foreground">
                  {(a.views_count ?? 0).toLocaleString()} reads
                </span>
              </span>
              <ArrowRight size={20} aria-hidden className="text-muted-foreground" />
            </LocalizedLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
