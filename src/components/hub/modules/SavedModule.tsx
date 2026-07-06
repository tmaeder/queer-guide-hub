import { useTranslation } from 'react-i18next';
import { SavedTab } from '@/components/profile/tabs/SavedTab';
import { NewsSavedSearchesPanel } from '@/components/news/NewsSavedSearchesPanel';

/**
 * Hub Saved module — everything the viewer bookmarked in one place. SavedTab
 * already spans venues, events, marketplace and saved news stories; the News
 * module's saved-search manager folds in below it here (2026-07), so saved
 * searches no longer live on a separate /hub/news surface. (The followed-tags
 * discovery feed moved to the public /news "For You" section.)
 */
export function SavedModule() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-10">
      <SavedTab />

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-display">
          {t('hub.news.savedSearches', { defaultValue: 'Saved searches' })}
        </h2>
        <NewsSavedSearchesPanel />
      </section>
    </div>
  );
}
