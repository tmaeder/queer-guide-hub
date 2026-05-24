import { Separator } from '@/components/ui/separator';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import type { Tables } from '@/integrations/supabase/types';
import { startOfWeek } from 'date-fns';

type Article = Tables<'news_articles'>;

interface WeekInReviewProps {
  articles: Article[];
  sourceCount?: number;
}

export function WeekInReview({ articles, sourceCount }: WeekInReviewProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisWeek = articles.filter((a) => {
    if (!a.published_at) return false;
    return new Date(a.published_at) >= weekStart;
  });

  const countryIds = new Set<string>();
  thisWeek.forEach((a) => {
    (a.country_ids ?? []).forEach((id) => countryIds.add(id));
  });

  const topRead = [...thisWeek]
    .filter((a) => (a.views_count ?? 0) > 0)
    .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0))
    .slice(0, 5);

  if (thisWeek.length === 0) return null;

  return (
    <section aria-labelledby="week-review-heading" className="mb-16">
      <Separator className="mb-6" />
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
        This week
      </p>
      <h2
        id="week-review-heading"
        className="m-0 text-display font-bold leading-none tracking-tight"
      >
        Most read.
      </h2>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-10 md:gap-16">
        <div className="border-r-0 md:border-r border-border md:pr-8">
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">By the numbers</p>
          <dl className="mt-6 flex flex-col gap-6">
            <div>
              <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Stories</dt>
              <dd className="m-0 text-hero font-bold leading-none tracking-tight">
                {thisWeek.length}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Countries covered</dt>
              <dd className="m-0 text-hero font-bold leading-none tracking-tight">
                {countryIds.size}
              </dd>
            </div>
            {sourceCount !== undefined && (
              <div>
                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Sources active</dt>
                <dd className="m-0 text-hero font-bold leading-none tracking-tight">
                  {sourceCount}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <ol className="m-0 p-0 list-none flex flex-col">
          {topRead.length === 0 && (
            <li className="text-sm text-muted-foreground">No reads tallied yet this week.</li>
          )}
          {topRead.map((a, i) => (
            <li
              key={a.id}
              className="border-b border-border last:border-b-0 py-4 flex gap-6 items-baseline"
            >
              <span className="text-display font-bold leading-none tracking-tight text-muted-foreground tabular-nums">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <LocalizedLink
                  to={`/news/${a.slug}`}
                  className="block no-underline text-foreground hover:underline text-title font-semibold leading-tight"
                >
                  {decodeHtmlEntities(a.title ?? '')}
                </LocalizedLink>
                <p className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
                  {(a.views_count ?? 0).toLocaleString()} reads
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
