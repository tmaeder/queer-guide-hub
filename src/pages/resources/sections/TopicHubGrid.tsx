/**
 * TopicHubGrid — Editorial grid of practical topic hubs on /resources.
 * Each card links to /resources/topic/:slug which composes guides + orgs +
 * news for the topic's tag cluster.
 *
 * Data source: topic_hubs Supabase table via useTopicHubs(). Falls back to
 * topics.config.ts when the query returns zero rows (offline / unseeded DB).
 */

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TOPIC_HUBS } from '@/pages/resources/topics.config';
import { useTopicHubs, topicIcon, type TopicHubRow } from '@/hooks/useTopicHubs';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { ChevronRight } from 'lucide-react';

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

export function TopicHubGrid() {
  const { t } = useTranslation();
  const safeMode = useSafeMode();
  const { data: dbHubs = [], isLoading } = useTopicHubs();
  const hubs: TopicHubRow[] = !isLoading && dbHubs.length === 0 ? configFallback() : dbHubs;
  const visible = hubs.filter((h) => !(h.adult && safeMode.enabled));

  return (
    <section aria-labelledby="topics-heading">
      <h2 id="topics-heading" className="text-base font-semibold mb-4">{t('resources.topicHubs.heading')}</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((topic) => (
          <li key={topic.slug}>
            <TopicCard topic={topic} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicCard({ topic }: { topic: TopicHubRow }) {
  const Icon = topicIcon(topic.icon_name);
  return (
    <LocalizedLink
      to={`/resources/topic/${topic.slug}`}
      className="group block h-full rounded-container border border-border bg-card p-4 transition-colors hover:bg-foreground/[0.03] no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon aria-hidden style={{ width: 18, height: 18, opacity: 0.75 }} />
          <span className="font-semibold text-sm">{topic.title}</span>
        </div>
        <ChevronRight
          aria-hidden
          className="opacity-30 transition-transform group-hover:translate-x-0.5"
          style={{ width: 16, height: 16 }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {topic.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {topic.tag_cluster.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[0.65rem] px-1.5 py-0.5 rounded-badge bg-foreground/5 text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </LocalizedLink>
  );
}
