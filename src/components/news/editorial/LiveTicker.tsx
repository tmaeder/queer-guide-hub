import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import type { Tables } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';

type Article = Pick<Tables<'news_articles'>, 'id' | 'slug' | 'title' | 'published_at'>;

interface LiveTickerProps {
  articles: Article[];
  windowMs?: number;
}

const DEFAULT_WINDOW = 90 * 60 * 1000;

export function LiveTicker({ articles, windowMs = DEFAULT_WINDOW }: LiveTickerProps) {
  const cutoff = Date.now() - windowMs;
  const fresh = articles
    .filter((a) => a.published_at && new Date(a.published_at).getTime() >= cutoff)
    .slice(0, 15);

  if (fresh.length === 0) return null;

  // Doubled list = seamless marquee loop. Reduced-motion users get the static
  // first 3 headlines below.
  const loop = [...fresh, ...fresh];

  return (
    <aside
      aria-label="Latest headlines"
      className="border-y border-border bg-surface-container-low overflow-hidden mb-12"
    >
      <div className="flex items-center">
        <p className="shrink-0 px-4 py-2 text-2xs uppercase tracking-[0.2em] font-semibold border-r border-border bg-foreground text-background flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-1.5 rounded-full bg-background animate-pulse motion-reduce:animate-none"
          />
          Live
        </p>

        {/* Marquee (hidden when reduced motion is preferred) */}
        <div className="news-ticker-track relative flex-1 overflow-hidden motion-reduce:hidden">
          <div className="news-ticker-marquee flex gap-10 whitespace-nowrap py-2 px-4">
            {loop.map((a, i) => (
              <LocalizedLink
                key={`${a.id}-${i}`}
                to={`/news/${a.slug}`}
                className="text-13 hover:underline no-underline text-foreground"
              >
                <span className="text-muted-foreground mr-2 text-2xs uppercase tracking-wider">
                  {a.published_at
                    ? formatDistanceToNow(new Date(a.published_at), { addSuffix: true })
                    : ''}
                </span>
                {decodeHtmlEntities(a.title ?? '')}
              </LocalizedLink>
            ))}
          </div>
        </div>

        {/* Static fallback for reduced-motion */}
        <div className="hidden motion-reduce:flex flex-1 overflow-hidden gap-10 py-2 px-4 whitespace-nowrap">
          {fresh.slice(0, 3).map((a) => (
            <LocalizedLink
              key={a.id}
              to={`/news/${a.slug}`}
              className="text-13 hover:underline no-underline text-foreground truncate"
            >
              {decodeHtmlEntities(a.title ?? '')}
            </LocalizedLink>
          ))}
        </div>
      </div>
    </aside>
  );
}
