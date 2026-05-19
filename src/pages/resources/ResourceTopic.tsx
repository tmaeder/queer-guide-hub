/**
 * ResourceTopic — Composed topic hub at /resources/topic/:slug.
 *
 * Pulls CMS guides (cms_pages.parent_slug = topic.cms_parent_slug), tagged venues
 * via get_venues_by_tag, and recent news articles whose tags overlap the
 * topic's tag cluster.
 *
 * Data source: topic_hubs Supabase table via useTopicHubs(). Falls back to
 * topics.config.ts when the query returns zero rows.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMeta } from '@/hooks/useMeta';
import { useTopicGuides, useTopicOrgs, useTopicNews } from '@/hooks/useResourceTopic';
import { useTopicHubs, topicIcon, type TopicHubRow } from '@/hooks/useTopicHubs';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { VenueCard } from '@/components/venues/VenueCard';
import { TOPIC_HUBS } from '@/pages/resources/topics.config';
import { ChevronLeft, ChevronRight, FileText, Newspaper } from 'lucide-react';

function configFallback(): TopicHubRow[] {
  return TOPIC_HUBS.map((t, i) => ({
    id: t.slug,
    slug: t.slug,
    title: t.title,
    description: t.description,
    icon_name: t.icon.displayName ?? t.icon.name ?? 'Heart',
    tag_cluster: t.tagCluster,
    cms_parent_slug: t.cmsParentSlug,
    adult: t.adult ?? false,
    sort_order: (i + 1) * 10,
  }));
}

export default function ResourceTopic() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const { data: dbHubs = [], isLoading: hubsLoading } = useTopicHubs();
  const hubs: TopicHubRow[] = !hubsLoading && dbHubs.length === 0 ? configFallback() : dbHubs;
  const topic = hubs.find((h) => h.slug === slug);

  useMeta({
    title: topic ? `${topic.title} — Resources` : 'Topic not found',
    description: topic?.description,
    canonicalPath: `/resources/topic/${slug}`,
  });

  const { data: guides = [], isLoading: guidesLoading } = useTopicGuides(topic?.cms_parent_slug);
  const { data: orgs = [], isLoading: orgsLoading } = useTopicOrgs(topic?.tag_cluster);
  const { data: news = [], isLoading: newsLoading } = useTopicNews(topic?.tag_cluster);

  const counts = useMemo(
    () => ({ guides: guides.length, orgs: orgs.length, news: news.length }),
    [guides, orgs, news],
  );

  if (hubsLoading) {
    return null;
  }

  if (!topic) {
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Topic not found</h1>
        <Button onClick={() => navigate('/resources')}>Back to resources</Button>
      </div>
    );
  }

  const Icon = topicIcon(topic.icon_name);

  return (
    <div className="container mx-auto py-8 md:py-16 px-4">
      <LocalizedLink
        to="/resources"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ChevronLeft aria-hidden style={{ width: 14, height: 14 }} />
        Resources
      </LocalizedLink>

      <PageHeader title={topic.title} subtitle={topic.description}>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Icon aria-hidden style={{ width: 18, height: 18 }} />
          <span>{counts.guides} guides · {counts.orgs} orgs · {counts.news} articles</span>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-10 mt-8">
        <section aria-labelledby="topic-guides-heading">
          <h2 id="topic-guides-heading" className="text-base font-semibold mb-4 inline-flex items-center gap-2">
            <FileText aria-hidden style={{ width: 18, height: 18 }} /> Guides
          </h2>
          {guidesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-container" />)}
            </div>
          ) : guides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guides published yet for this topic.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {guides.map((g) => (
                <li key={g.slug}>
                  <LocalizedLink
                    to={`/p/${g.slug}`}
                    className="block rounded-container border border-border p-4 hover:bg-foreground/[0.03] no-underline text-inherit"
                  >
                    <p className="font-semibold text-sm">{g.title}</p>
                    {(g.excerpt || g.subtitle) && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {g.excerpt || g.subtitle}
                      </p>
                    )}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="topic-orgs-heading">
          <h2 id="topic-orgs-heading" className="text-base font-semibold mb-4">Organisations</h2>
          {orgsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-container" />)}
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organisations indexed for this topic yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {orgs.map((v) => (
                <li key={v.id}><VenueCard venue={v} /></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="topic-news-heading">
          <h2 id="topic-news-heading" className="text-base font-semibold mb-4 inline-flex items-center gap-2">
            <Newspaper aria-hidden style={{ width: 18, height: 18 }} /> Recent news
          </h2>
          {newsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-container" />)}
            </div>
          ) : news.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent articles tagged for this topic.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {news.map((n) => (
                <li key={n.id}>
                  <LocalizedLink
                    to={`/news/${n.slug}`}
                    className="block rounded-container border border-border p-4 hover:bg-foreground/[0.03] no-underline text-inherit"
                  >
                    <p className="font-semibold text-sm line-clamp-2">{n.title}</p>
                    {n.publisher_name && (
                      <p className="mt-1 text-[0.7rem] text-muted-foreground">{n.publisher_name}</p>
                    )}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <LocalizedLink
          to="/resources"
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          More topics
          <ChevronRight aria-hidden style={{ width: 14, height: 14 }} />
        </LocalizedLink>
      </div>
    </div>
  );
}
