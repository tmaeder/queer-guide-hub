import { formatDistanceToNow } from 'date-fns';
import { Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useRightsNews } from '@/hooks/useRightsNews';
import {
  RIGHT_SECTION_LABEL,
  RIGHT_SECTION_ORDER,
  topicListLabel,
  topicsInSection,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';

interface RightsNewsSectionProps {
  topic: RightTopic;
  onTopicChange: (topic: RightTopic) => void;
  countryId?: string | null;
  countryName?: string | null;
}

export function RightsNewsSection({
  topic,
  onTopicChange,
  countryId,
  countryName,
}: RightsNewsSectionProps) {
  const { t } = useTranslation();
  const { data: articles = [], isLoading, error } = useRightsNews(topic, countryId, 6);
  const topicLabel = topicListLabel(topic, t);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-prose">
          <label
            htmlFor="rights-news-topic"
            className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            Reporting about
          </label>
          <select
            id="rights-news-topic"
            value={topic.slug}
            onChange={(event) => {
              const selected = RIGHT_SECTION_ORDER.flatMap((section) =>
                topicsInSection(section),
              ).find((candidate) => candidate.slug === event.target.value);
              if (selected) onTopicChange(selected);
            }}
            className="mt-2 block w-full rounded-element border border-border bg-background px-4 py-2 text-sm text-foreground sm:min-w-72"
          >
            {RIGHT_SECTION_ORDER.map((section) => (
              <optgroup key={section} label={RIGHT_SECTION_LABEL[section]}>
                {topicsInSection(section).map((candidate) => (
                  <option key={candidate.slug} value={candidate.slug}>
                    {topicListLabel(candidate, t)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <p className="m-0 max-w-prose text-13 text-muted-foreground sm:text-right">
          Journalism adds current context. ILGA remains the source for the legal status above.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading relevant coverage…
        </p>
      ) : error ? (
        <p className="text-muted-foreground" role="alert">
          Relevant coverage is temporarily unavailable.
        </p>
      ) : articles.length === 0 ? (
        <p className="text-muted-foreground">No recent coverage matched {topicLabel}.</p>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 p-0 m-0 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => {
            const isBroader = article.relevance_tier === 'rights-general-recent';
            const isStory = article.story_article_count > 1 && article.story_slug;
            const href = isStory ? `/news/story/${article.story_slug}` : `/news/${article.slug}`;
            return (
              <li key={article.id} className="h-full">
                <LocalizedLink
                  to={href}
                  className="flex h-full flex-col gap-4 rounded-container border border-border bg-surface-container p-6 text-inherit no-underline transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs uppercase tracking-wide text-muted-foreground">
                    <span>{isBroader ? 'Broader rights coverage' : `Matches: ${topicLabel}`}</span>
                    {article.is_local && countryName ? <span>· {countryName}</span> : null}
                  </div>
                  <h3 className="m-0 text-15 font-semibold leading-tight">{article.title}</h3>
                  {article.excerpt ? (
                    <p className="m-0 line-clamp-3 text-sm text-muted-foreground">
                      {article.excerpt}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted-foreground">
                    {article.publisher_name ? <span>{article.publisher_name}</span> : null}
                    <span>
                      {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
                    </span>
                    {isStory ? (
                      <span className="inline-flex items-center gap-1">
                        <Layers size={12} aria-hidden="true" />
                        {article.story_article_count} articles
                      </span>
                    ) : null}
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
