import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Layers, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { safeText } from '@/utils/safeDisplay';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import { useMemo, useState } from 'react';
import type { NewsStory, NewsStoryArticle } from '@/hooks/useNewsStories';

interface StoryCardProps {
  story: NewsStory;
  hero?: NewsStoryArticle;
}

export const StoryCard = ({ story, hero }: StoryCardProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = useMemo(() => getRandomFallbackImage(), []);
  const img = hero?.image_url && !imgFailed ? hero.image_url : fallback;
  const title = safeText(decodeHtmlEntities(story.title));

  return (
    <LocalizedLink
      to={`/news/story/${story.slug}`}
      aria-label={title}
      className="group flex flex-col gap-3 rounded-element border border-border bg-background overflow-hidden transition-colors duration-300 hover:border-foreground/40 hover:bg-muted/40 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative overflow-hidden">
        <img
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          src={img}
          alt={title}
          width={400}
          height={200}
          style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
          className="grayscale-[0.15] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-[1.04]"
          onError={() => setImgFailed(true)}
        />
        <Badge
          className="absolute top-2 left-2 inline-flex items-center gap-1"
          style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
        >
          <Layers style={{ width: 10, height: 10 }} aria-hidden="true" />
          {story.article_count} articles
        </Badge>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <h3 className="text-lg font-bold leading-tight m-0" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {title}
        </h3>
        {hero?.excerpt && (
          <p className="text-sm text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {safeText(hero.excerpt)}
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock style={{ width: 12, height: 12 }} aria-hidden="true" />
          <span>Updated {formatDistanceToNow(new Date(story.last_updated_at), { addSuffix: true })}</span>
        </div>
      </div>
    </LocalizedLink>
  );
};
