import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fetchStoryBySlug, type StoryDetail } from '@/hooks/useNewsStories';
import { useMeta } from '@/hooks/useMeta';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Layers, Clock, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { safeText } from '@/utils/safeDisplay';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Newspaper } from 'lucide-react';

export default function NewsStoryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!slug) return;
    fetchStoryBySlug(slug).then((s) => {
      if (cancelled) return;
      setStory(s);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug]);

  const title = story ? safeText(decodeHtmlEntities(story.title)) : 'Story';
  useMeta({
    title,
    description: story?.summary || `${story?.article_count ?? ''} articles covering ${title}`,
    canonicalPath: slug ? `/news/story/${slug}` : '/news',
    jsonLd: story
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: title,
          datePublished: story.first_seen_at,
          dateModified: story.last_updated_at,
          url: `https://queer.guide/news/story/${slug}`,
        }
      : undefined,
  });

  if (loading) return <div className="container mx-auto px-4 py-12"><PageLoadingState count={1} /></div>;

  if (!story) {
    return (
      <div className="container mx-auto px-4 py-12">
        <EmptyState
          icon={Newspaper}
          title="Story not found"
          description="This story may have been removed."
          primaryAction={{ label: 'Back to News', onClick: () => window.history.back() }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <LocalizedLink to="/news" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 no-underline">
        <ArrowLeft size={14} /> Back to News
      </LocalizedLink>

      <div className="flex items-center gap-2 mb-3">
        <Badge style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }} className="inline-flex items-center gap-1">
          <Layers style={{ width: 10, height: 10 }} aria-hidden="true" />
          {story.article_count} articles
        </Badge>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock style={{ width: 12, height: 12 }} aria-hidden="true" />
          Updated {formatDistanceToNow(new Date(story.last_updated_at), { addSuffix: true })}
        </span>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{title}</h1>

      {story.summary && (
        <p className="text-lg text-muted-foreground mb-8">{story.summary}</p>
      )}

      <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">Coverage</h2>
      <ol className="flex flex-col gap-3 list-none p-0 m-0">
        {story.articles.map((a) => (
          <li key={a.id}>
            <LocalizedLink
              to={`/news/${a.slug}`}
              className="flex gap-4 p-3 rounded-element border border-border hover:bg-muted no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {a.image_url && (
                <img
                  loading="lazy"
                  src={a.image_url}
                  alt=""
                  width={120}
                  height={80}
                  style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                />
              )}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-snug m-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {safeText(decodeHtmlEntities(a.title))}
                </h3>
                <p className="text-xs text-muted-foreground m-0">
                  {a.published_at ? format(new Date(a.published_at), 'PP') : ''}
                </p>
              </div>
            </LocalizedLink>
          </li>
        ))}
      </ol>
    </div>
  );
}
