import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { NewsCard } from '@/components/news/NewsCard';
import { NewsSavedSearchesPanel } from '@/components/news/NewsSavedSearchesPanel';
import { useNewsDigest } from '@/hooks/useNewsDigest';

/**
 * Hub News module — a personal digest: saved stories, recent articles from
 * the tags you follow, and saved-search management (the first personal home
 * for NewsSavedSearchesPanel). Read + manage only; no personalization engine.
 */
export function NewsModule() {
  const { t } = useTranslation();
  const { saved, savedLoading, followedTags, tagArticles, tagLoading } = useNewsDigest();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-headline font-display">
        {t('hub.news.title', { defaultValue: 'News' })}
      </h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-display">
          {t('hub.news.savedStories', { defaultValue: 'Saved stories' })}
        </h2>
        {savedLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.news.savedEmpty', { defaultValue: 'No saved stories yet.' })}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {saved.map((article) => (
              <NewsCard key={article.id} article={article} variant="compact" />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-display">
          {t('hub.news.fromTags', { defaultValue: 'From your tags' })}
        </h2>
        {tagLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : followedTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.news.tagsEmpty', {
              defaultValue: 'Follow tags to see matching stories here.',
            })}
          </p>
        ) : tagArticles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.news.tagsNoArticles', { defaultValue: 'Nothing new from your tags yet.' })}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tagArticles.map((article) => (
              <NewsCard key={article.id} article={article} variant="compact" />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-display">
          {t('hub.news.savedSearches', { defaultValue: 'Saved searches' })}
        </h2>
        <NewsSavedSearchesPanel />
      </section>
    </div>
  );
}
