import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Clock, Hash } from 'lucide-react';

export type NewsTab = 'for-you' | 'latest' | 'topics';

interface NewsTabsBarProps {
  value: NewsTab;
  onChange: (tab: NewsTab) => void;
}

// Segmented control switching the feed body between For You / Latest / Topics.
// The editorial crown above stays rendered regardless.
export function NewsTabsBar({ value, onChange }: NewsTabsBarProps) {
  const { t } = useTranslation();
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as NewsTab)} className="mt-2">
      <TabsList aria-label={t('pages.news.feedViews', 'News views')}>
        <TabsTrigger value="for-you" className="gap-1.5">
          <Sparkles size={15} aria-hidden="true" />
          {t('pages.news.tabForYou', 'For You')}
        </TabsTrigger>
        <TabsTrigger value="latest" className="gap-1.5">
          <Clock size={15} aria-hidden="true" />
          {t('pages.news.tabLatest', 'Latest')}
        </TabsTrigger>
        <TabsTrigger value="topics" className="gap-1.5">
          <Hash size={15} aria-hidden="true" />
          {t('pages.news.tabTopics', 'Topics')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
