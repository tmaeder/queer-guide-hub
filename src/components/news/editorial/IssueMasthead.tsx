import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { PageIntro } from '@/components/layout/PageIntro';

interface IssueMastheadProps {
  totalArticles?: number;
  sourceCount?: number;
}

const EPOCH = new Date('2020-01-06T00:00:00Z').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function IssueMasthead({ totalArticles, sourceCount }: IssueMastheadProps) {
  const { t } = useTranslation();
  const now = new Date();
  const issueNumber = Math.floor((now.getTime() - EPOCH) / WEEK_MS);

  return (
    <header className="mb-8">
      <PageIntro
        title={t('header.intents.news.label', 'News')}
        lede={t('header.intents.news.subtitle', 'LGBTQ+ news from around the world')}
      />
      <p className="mt-4 text-2xs uppercase tracking-[0.2em] text-muted-foreground">
        {format(now, 'EEEE · MMMM d, yyyy')} · Issue #{issueNumber}
      </p>
      {(totalArticles !== undefined || sourceCount !== undefined) && (
        <p className="mt-2 text-13 text-muted-foreground uppercase tracking-wider">
          {totalArticles !== undefined && <>{totalArticles.toLocaleString()} stories</>}
          {totalArticles !== undefined && sourceCount !== undefined && <> · </>}
          {sourceCount !== undefined && <>{sourceCount} sources worldwide</>}
        </p>
      )}
    </header>
  );
}
